// src/components/dashboard/DashboardViewer.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useDashboardEtlData } from "@/hooks/useDashboardEtlData";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, X, List, CheckSquare, Download, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2";

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
  ChartDataLabels
);

import { DashboardTextWidget } from "./DashboardTextWidget";

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

type AggregationFilter = {
  id: string;
  field: string;
  operator: string;
  value: any;
  convertToNumber?: boolean;
  inputType?: "text" | "select" | "number" | "date";
  distinctValues?: any[];
};

type AggregationMetric = {
  id: string;
  field: string;
  func: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "COUNT(DISTINCT";
  alias: string;
  conversionType?: "none" | "multiply" | "divide";
  conversionFactor?: number;
  precision?: number;
  allowStringAsNumeric?: boolean;
  numericCast?: "none" | "numeric" | "sanitize";
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
  config?: ChartConfig;
  content?: string;
  filterConfig?: FilterWidgetConfig;
  facetValues?: Record<string, any[]>;
  autoLoad?: boolean;
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
  columns?: Array<{
    name: string;
    type: "string" | "number" | "boolean" | "date" | "unknown";
  }>;
  excludeGlobalFilters?: boolean;
  color?: string;
  isLoading?: boolean;
  imageConfig?: {
    width?: number;
    height?: number;
    objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  };
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

const GRID = 16;
const snap = (v: number, grid = GRID) => Math.round(v / grid) * grid;

interface DashboardViewerProps {
  dashboardId: string;
  apiEndpoints?: {
    etlData?: string;
    aggregateData?: string;
    rawData?: string;
    distinctValues?: string;
  };
  isPublic?: boolean;
  // Props for Preview Mode
  initialWidgets?: Widget[];
  initialTitle?: string;
  initialGlobalFilters?: AggregationFilter[];
}

export function DashboardViewer({
  dashboardId,
  apiEndpoints,
  isPublic = false,
  initialWidgets,
  initialTitle,
  initialGlobalFilters,
}: DashboardViewerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState<string>("Dashboard");
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [globalFilters, setGlobalFilters] = useState<AggregationFilter[]>([]);
  const [globalDialogOpen, setGlobalDialogOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ... (rest of state definitions)

  // Estado para los valores de los widgets de filtro
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [filterDisplayModes, setFilterDisplayModes] = useState<
    Record<string, "select" | "list">
  >({});

  // Estado y funciones para renombrar y eliminar widgets
  const [widgetToRename, setWidgetToRename] = useState<Widget | null>(null);
  const [newTitle, setNewTitle] = useState("");

  // ... (handlers like handleRemoveWidget, openRenameDialog, saveRename, fetchDistinctOptions, useEffect for filter options)

  const handleRemoveWidget = (widgetId: string) => {
    const w = widgets.find((x) => x.id === widgetId);
    if (w && w.type === "filter" && w.filterConfig) {
      const fConfig = w.filterConfig;
      const val = filterValues[widgetId];
      const restored: AggregationFilter = {
        id: `gf-${Date.now()}`,
        field: fConfig.field,
        operator: fConfig.operator,
        value: val !== undefined ? val : "",
        inputType: fConfig.inputType,
        distinctValues: w.facetValues?.[fConfig.field],
        convertToNumber: fConfig.inputType === "number",
      };
      setGlobalFilters((prev) => [...prev, restored]);
      setFilterValues((prev) => {
        const next = { ...prev };
        delete next[widgetId];
        return next;
      });
      toast.info("Filtro devuelto a globales");
    }
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
  };

  const openRenameDialog = (widget: Widget) => {
    setWidgetToRename(widget);
    setNewTitle(widget.title || "");
  };

  const saveRename = () => {
    if (widgetToRename) {
      setWidgets((prev) =>
        prev.map((w) =>
          w.id === widgetToRename.id ? { ...w, title: newTitle } : w
        )
      );
      setWidgetToRename(null);
    }
  };

  const fetchDistinctOptions = useCallback(
    async (widgetId: string, field: string) => {
      const w = widgets.find((x) => x.id === widgetId);
      if (!w || !w.source?.table || !field) return;
      try {
        const url =
          apiEndpoints?.distinctValues || "/api/dashboard/distinct-values";
        const transformVal =
          (w.filterConfig?.operator || "").toUpperCase() === "YEAR"
            ? "YEAR"
            : undefined;
        console.log(
          "[DashboardViewer] fetchDistinctOptions transform:",
          transformVal
        );

        const res = await fetch(url, {
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
        if (!res.ok) throw new Error("Error fetching options");
        const values = await res.json();
        setWidgets((prev) =>
          prev.map((wx) => {
            if (wx.id !== widgetId) return wx;
            const fv = { ...(wx.facetValues || {}), [field]: values };
            return { ...wx, facetValues: fv };
          })
        );
      } catch (e) {
        console.error(e);
      }
    },
    [widgets, apiEndpoints?.distinctValues]
  );

  // Cargar opciones para filtros de tipo select
  useEffect(() => {
    widgets.forEach((w) => {
      if (
        w.type === "filter" &&
        w.filterConfig?.inputType === "select" &&
        w.filterConfig.field
      ) {
        if (!w.facetValues?.[w.filterConfig.field]) {
          fetchDistinctOptions(w.id, w.filterConfig.field);
        }
      }
    });
  }, [widgets, fetchDistinctOptions]);

  const { data: etlData } = useDashboardEtlData(
    dashboardId,
    apiEndpoints?.etlData
  );

  // ... (Zoom & Pan logic, which is fine)

  // Zoom & Pan (solo visualización: sin drag/resize de widgets)
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

  const dragState = useRef<{
    id: string | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ id: null, startX: 0, startY: 0, origX: 0, origY: 0 });

  const startDragWidget = (id: string, e: React.PointerEvent) => {
    if (isCtrlPressedRef.current || e.ctrlKey || e.button === 1) return;
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

  const pinFilterToCanvas = async (f: AggregationFilter) => {
    const supabase = createClient();
    const etlId = etlData?.etl?.id;
    let fullTableName: string | undefined;

    // Prefer using the table name resolution from the hook if available, especially for public mode
    if (etlData?.etlData?.name) {
      fullTableName = etlData.etlData.name;
    } else if (etlId && !isPublic) {
      // Fallback for editor mode or if existing hook data is partial
      const { data: run } = await supabase
        .from("etl_runs_log")
        .select("destination_schema,destination_table_name")
        .eq("etl_id", etlId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (run && run.destination_table_name) {
        fullTableName = `${run.destination_schema || "etl_output"}.${
          run.destination_table_name
        }`;
      }
    }

    const newWidget: Widget = {
      id: `w-filter-${Date.now()}`,
      type: "filter",
      title: f.field,
      x: snap((-pan.x + 100) / zoom),
      y: snap((-pan.y + 100) / zoom),
      w: 300,
      h: 120,
      filterConfig: {
        label: f.field,
        field: f.field,
        operator: f.operator,
        inputType: (f as any).inputType || "text",
      },
      facetValues:
        (f as any).distinctValues && (f as any).distinctValues.length > 0
          ? { [f.field]: (f as any).distinctValues }
          : {},
      source: {
        table: fullTableName,
        etlId,
      },
    };
    setWidgets((prev) => [...prev, newWidget]);
    setGlobalFilters((prev) => prev.filter((gf) => gf.id !== f.id));
    toast.success("Filtro añadido al lienzo");
  };

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

  const zoomBy = useCallback(
    (factor: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setZoomAt(zoom * factor, rect.width / 2, rect.height / 2);
    },
    [zoom, setZoomAt]
  );

  const handleZoomIn = useCallback(() => zoomBy(1.1), [zoomBy]);
  const handleZoomOut = useCallback(() => zoomBy(0.9), [zoomBy]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        const el: any = rootRef.current;
        if (!el) return;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        else if (el.msRequestFullscreen) await el.msRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if ((document as any).webkitExitFullscreen)
          await (document as any).webkitExitFullscreen();
        else if ((document as any).msExitFullscreen)
          await (document as any).msRequestFullscreen();
      }
    } catch (e) {
      console.error("[DashboardViewer] Fullscreen error:", e);
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control") {
        if (!isCtrlPressedRef.current) {
          isCtrlPressedRef.current = true;
          document.body.classList.add("cursor-grab");
        }
      }
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
    } else {
      // Iniciar drag de widget
      const target = e.currentTarget as HTMLElement;
      const w = widgets.find((w) => w.id === target.dataset.id);
      if (w) {
        startDragWidget(w.id, e);
      }
    }
  };
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (panningStateRef.current.active) {
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      const dx = currentX - panningStateRef.current.startX;
      const dy = currentY - panningStateRef.current.startY;
      setPan({
        x: panningStateRef.current.origPanX + dx,
        y: panningStateRef.current.origPanY + dy,
      });
    } else if (dragState.current.id) {
      const cx = (e.clientX - rect.left - pan.x) / zoom;
      const cy = (e.clientY - rect.top - pan.y) / zoom;
      const dx = cx - dragState.current.startX;
      const dy = cy - dragState.current.startY;

      setWidgets((prev) =>
        prev.map((w) =>
          w.id === dragState.current.id
            ? {
                ...w,
                x: snap(dragState.current.origX + dx),
                y: snap(dragState.current.origY + dy),
              }
            : w
        )
      );
    }
  };
  const onCanvasPointerUp = () => {
    if (panningStateRef.current.active) panningStateRef.current.active = false;
    dragState.current.id = null;
  };

  // Cargar layout y filtros guardados
  useEffect(() => {
    let cancelled = false;

    // Use ETL Data if public or available to avoid DB Call
    if (etlData?.dashboard) {
      const d = etlData.dashboard as any;
      if (!cancelled) {
        setTitle(d.title || "Dashboard");
        setWidgets(Array.isArray(d.layout) ? d.layout : []);
        setGlobalFilters(
          Array.isArray(d.global_filters_config) ? d.global_filters_config : []
        );
      }
      return;
    }

    // PREVIEW MODE: If initial data is provided, use it and DO NOT fetch.
    if (initialWidgets) {
      if (!cancelled) {
        setTitle(initialTitle || "Dashboard");
        setWidgets(initialWidgets);
        if (initialGlobalFilters) {
          setGlobalFilters(initialGlobalFilters);
        }
      }
      return;
    }

    // Only fetch if NOT public (because public API already returns it, and simple token != id)
    if (isPublic) return;

    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("dashboard")
          .select("title,layout,global_filters_config")
          .eq("id", dashboardId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return;
        if (!cancelled) {
          setTitle(data.title || "Dashboard");
          setWidgets(Array.isArray(data.layout) ? (data.layout as any) : []);
          setGlobalFilters(
            Array.isArray(data.global_filters_config)
              ? (data.global_filters_config as any)
              : []
          );
        }
      } catch (e: any) {
        console.error("[DashboardViewer] No se pudo cargar el dashboard:", e);
        toast.error(e?.message || "No se pudo cargar el dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    dashboardId,
    etlData,
    isPublic,
    initialWidgets,
    initialTitle,
    initialGlobalFilters,
  ]);

  // Cargar valores distintos para filtros globales de tipo "select"
  useEffect(() => {
    const loadDistinctValues = async () => {
      console.log("[DashboardViewer] loadDistinctValues - Start", {
        hasEtlData: !!etlData,
        etlId: etlData?.etl?.id,
        globalFiltersCount: globalFilters.length,
        globalFilters: globalFilters.map((f) => ({
          id: f.id,
          field: f.field,
          inputType: (f as any).inputType,
          hasDistinctValues: !!(f as any).distinctValues,
          distinctValuesLength: ((f as any).distinctValues || []).length,
        })),
      });

      if (!etlData || globalFilters.length === 0) {
        console.log(
          "[DashboardViewer] loadDistinctValues - Skipping (no etlData or no filters)"
        );
        return;
      }

      // Obtener el nombre real de la tabla desde etl_runs_log
      const etlId = etlData?.etl?.id;
      if (!etlId) {
        console.log(
          "[DashboardViewer] loadDistinctValues - Skipping (no etlId)"
        );
        return;
      }

      let fullTableName = "";

      if (etlData.etlData?.name) {
        // Si el nombre ya incluye el esquema (tiene punto), usarlo tal cual.
        // Si no, asumir etl_output por defecto si no es la tabla legacy.
        if (etlData.etlData.name.includes(".")) {
          fullTableName = etlData.etlData.name;
        } else if (etlData.etlData.name === "etl_data_warehouse") {
          fullTableName = "public.etl_data_warehouse";
        } else {
          fullTableName = `etl_output.${etlData.etlData.name}`;
        }
      } else if (!isPublic) {
        const supabase = createClient();
        const { data: run, error: runErr } = await supabase
          .from("etl_runs_log")
          .select("destination_schema,destination_table_name")
          .eq("etl_id", etlId)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (runErr || !run || !run.destination_table_name) {
          console.log(
            "[DashboardViewer] loadDistinctValues - No completed run found"
          );
          return;
        }
        const schema = run.destination_schema || "etl_output";
        const actualTableName = run.destination_table_name;
        fullTableName = `${schema}.${actualTableName}`;
      } else {
        // Public but no name?
        return;
      }

      console.log("[DashboardViewer] Using actual table name:", {
        etlId,
        fullTableName,
      });

      for (const f of globalFilters) {
        console.log("[DashboardViewer] Checking filter:", {
          id: f.id,
          field: f.field,
          inputType: (f as any).inputType,
          hasDistinctValues: !!(f as any).distinctValues,
          willLoad:
            (f as any).inputType === "select" &&
            f.field &&
            !(f as any).distinctValues,
        });

        const isYear = (f.operator || "").toUpperCase() === "YEAR";
        const hasValues =
          !!(f as any).distinctValues && (f as any).distinctValues.length > 0;
        let shouldLoad = false;

        if ((f as any).inputType === "select" && f.field) {
          if (!hasValues) {
            shouldLoad = true;
          } else if (isYear) {
            // Si es YEAR pero los valores parecen fechas completas (contienen - o /), recargar
            const firstVal = String((f as any).distinctValues[0]);
            if (firstVal.includes("-") || firstVal.includes("/")) {
              console.log(
                "[DashboardViewer] Detected full dates in YEAR filter, reloading...",
                f.id
              );
              shouldLoad = true;
            }
          }
        }

        if (shouldLoad) {
          try {
            console.log("[DashboardViewer] Fetching distinct values for:", {
              filterId: f.id,
              field: f.field,
              tableName: fullTableName,
              reason: hasValues ? "fix-year-format" : "missing-values",
            });

            const url =
              apiEndpoints?.distinctValues || "/api/dashboard/distinct-values";
            console.log("[DashboardViewer] Fetching distinct values for:", {
              filterId: f.id,
              field: f.field,
              tableName: fullTableName,
              url,
            });

            const transformVal =
              (f.operator || "").toUpperCase() === "YEAR" ? "YEAR" : undefined;
            console.log(
              "[DashboardViewer] Sending distinct values request with transform:",
              transformVal
            );

            const res = await fetch(url, {
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

            console.log("[DashboardViewer] API response:", {
              filterId: f.id,
              ok: res.ok,
              status: res.status,
              statusText: res.statusText,
            });

            if (res.ok) {
              const values = await res.json();
              console.log("[DashboardViewer] Loaded distinct values:", {
                filterId: f.id,
                field: f.field,
                valuesCount: values.length,
                firstValues: values.slice(0, 5),
              });

              setGlobalFilters((prev) =>
                prev.map((gf) =>
                  gf.id === f.id ? { ...gf, distinctValues: values } : gf
                )
              );
            } else {
              const errorText = await res.text();
              console.error("[DashboardViewer] API error:", {
                filterId: f.id,
                status: res.status,
                error: errorText,
              });
            }
          } catch (e) {
            console.error("[DashboardViewer] Error loading distinct values:", {
              filterId: f.id,
              field: f.field,
              error: e,
            });
          }
        }
      }
    };

    loadDistinctValues();
  }, [globalFilters, etlData]);

  // Cargar datos en cada widget (reutilizando la lógica del editor)
  const loadETLDataIntoWidget = useCallback(
    async (widgetId: string) => {
      console.log(
        "[DashboardViewer] loadETLDataIntoWidget called for:",
        widgetId
      );
      const widget = widgets.find((w) => w.id === widgetId);
      if (!widget) {
        console.warn("[DashboardViewer] Widget not found:", widgetId);
        return;
      }

      // Set loading state
      setWidgets((prev) =>
        prev.map((w) => (w.id === widgetId ? { ...w, isLoading: true } : w))
      );

      // Manejo especial para widgets de filtro tipo select
      if (
        widget.type === "filter" &&
        widget.filterConfig?.inputType === "select" &&
        widget.filterConfig.field
      ) {
        console.log(
          "[DashboardViewer] Reloading filter options for:",
          widget.title
        );
        await fetchDistinctOptions(widgetId, widget.filterConfig.field);
        toast.success("Opciones actualizadas");
        return;
      }
      // Filter text widgets
      if (widget.type === "text" || widget.type === "image") {
        return;
      }

      // Add guard to prevent execution before data is loaded
      if (!etlData) {
        console.log("[DashboardViewer] Skipping load: etlData not ready");
        return;
      }

      const supabase = createClient();
      const etlId = etlData?.etl?.id;
      console.log("[DashboardViewer] ETL ID:", etlId);

      if (!etlId) {
        // If etlData is loaded but has no ETL ID, it's a valid "empty" state, OR it's an error if we expected one.
        // We will log but maybe not error toast if it's just initializing?
        // Actually if etlData is truthy, we expect etlId unless dashboard has no ETL.
        console.error("[DashboardViewer] No ETL ID found in loaded data");
        // toast.error("No hay un ETL asociado a este dashboard");
        return;
      }

      let fullTableName: string | undefined;

      // OPTIMIZATION: Use the table name already resolved by the hook/API
      if (etlData.etlData?.name) {
        fullTableName = etlData.etlData.name;
        if (!fullTableName.includes(".")) {
          fullTableName = `etl_output.${fullTableName}`;
        }
        console.log("[DashboardViewer] Using cached table:", fullTableName);
      } else {
        // Fallback to internal query (only works if authenticated)
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
            console.warn("[DashboardViewer] No complete ETL run found", {
              etlId,
              run,
            });
            toast.warning(
              "No se encontró una ejecución completada para este ETL."
            );
            return;
          }

          const schema = run.destination_schema || "etl_output";
          const table = run.destination_table_name;
          fullTableName = `${schema}.${table}`;

          console.log("[DashboardViewer] Loading widget data", {
            widgetId,
            fullTableName,
            schema,
            table,
          });
        } catch (e) {
          console.error("[DashboardViewer] Error determining table:", e);
          return;
        }
      }

      if (!fullTableName) return;
      console.log("[DashboardViewer] Final table:", fullTableName);

      try {
        let dataArray: any[] = [];
        const aggConfig = widget.aggregationConfig;

        if (aggConfig && aggConfig.enabled && aggConfig.metrics.length > 0) {
          console.log("[DashboardViewer] Loading aggregated data...");
          // Construir filtros desde widgets de tipo 'filter'
          console.log(
            "[DashboardViewer] Building filters with filterValues:",
            filterValues
          );

          // Identificar campos controlados por widgets para no duplicar filtros globales
          const fieldsWithWidgets = new Set(
            widgets
              .filter((w) => w.type === "filter" && w.filterConfig?.field)
              .map((w) => w.filterConfig!.field)
          );

          const widgetFilters: AggregationFilter[] = widgets
            .filter(
              (w) =>
                w.type === "filter" &&
                filterValues[w.id] !== undefined &&
                filterValues[w.id] !== "" &&
                filterValues[w.id] !== null
            )
            .map((w) => {
              const val = filterValues[w.id];
              const isArray = Array.isArray(val);
              const originalOp = w.filterConfig?.operator || "=";
              const isSpecialOp = ["MONTH", "YEAR", "DAY"].includes(originalOp);
              return {
                id: `wf-${w.id}`,
                field: w.filterConfig?.field || "",
                operator: isArray && !isSpecialOp ? "IN" : originalOp,
                value: val,
                convertToNumber: w.filterConfig?.inputType === "number",
              };
            })
            .filter((f) => f.field !== "");
          console.log(
            "[DashboardViewer] Constructed widgetFilters:",
            widgetFilters
          );

          const rawFilters = [
            ...(!widget.excludeGlobalFilters
              ? globalFilters
                  .filter(
                    (f) =>
                      f.value !== "" &&
                      f.value !== null &&
                      f.value !== undefined &&
                      !fieldsWithWidgets.has(f.field)
                  )
                  .map((f) => ({ ...f }))
              : []),
            ...widgetFilters,
            ...(aggConfig.filters || []).map((f) => ({ ...f })),
          ];
          const preparedFilters = rawFilters
            .filter((f) => {
              const op = (f.operator || "=").toUpperCase().trim();
              if (op === "MONTH") {
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
                  SETIEMBRE: 9,
                  OCTUBRE: 10,
                  NOVIEMBRE: 11,
                  DICIEMBRE: 12,
                };
                const parseMonth = (val: any) => {
                  const vRaw = typeof val === "string" ? val.trim() : val;
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
                    return null;
                  }
                  return monthNum;
                };

                if (Array.isArray(f.value)) {
                  const validMonths = f.value
                    .map(parseMonth)
                    .filter((v: any) => v !== null);
                  if (validMonths.length === 0) return false;
                  (f as any).value = validMonths;
                } else {
                  const m = parseMonth(f.value);
                  if (m === null) return false;
                  (f as any).value = m;
                }
              } else if (op === "DAY") {
                const dayStr = String(f.value || "").trim();
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) {
                  return false;
                }
                (f as any).value = dayStr;
              } else if (op === "YEAR") {
                const parseYear = (val: any) => {
                  const vRaw = typeof val === "string" ? val.trim() : val;
                  const yearNum = Number(vRaw);
                  if (
                    isNaN(yearNum) ||
                    !Number.isInteger(yearNum) ||
                    yearNum < 1900 ||
                    yearNum > 2100
                  ) {
                    return null;
                  }
                  return yearNum;
                };

                if (Array.isArray(f.value)) {
                  const validYears = f.value
                    .map(parseYear)
                    .filter((v: any) => v !== null);
                  if (validYears.length === 0) return false;
                  (f as any).value = validYears;
                } else {
                  const y = parseYear(f.value);
                  if (y === null) return false;
                  (f as any).value = y;
                }
              }
              return true;
            })
            .map((f) => ({
              ...f,
              cast: f.convertToNumber ? "numeric" : undefined,
            }));

          console.log("[DashboardViewer] Sending aggregate request:", {
            tableName: fullTableName,
            filters: preparedFilters,
            metrics: aggConfig.metrics,
          });

          const url =
            apiEndpoints?.aggregateData || "/api/dashboard/aggregate-data";
          const response = await fetch(url, {
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
            const errorData = await response.json().catch(() => ({}));
            console.error("[DashboardViewer] Aggregate API error:", errorData);
            throw new Error(
              errorData?.error || "Falló la llamada a la API de agregación"
            );
          }
          dataArray = await response.json();
          console.log(
            "[DashboardViewer] Aggregated data loaded, rows:",
            dataArray.length
          );

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
                    if (cfg.type === "multiply") val = val * (cfg.factor || 1);
                    else if (cfg.type === "divide") {
                      const divisor = cfg.factor || 1;
                      val = divisor === 0 ? val : val / divisor;
                    }
                    if (typeof cfg.precision === "number")
                      val = Number(val.toFixed(cfg.precision));
                    (newRow as any)[alias] = val;
                  }
                }
                return newRow;
              });
            }
          } catch {}
        } else {
          console.log("[DashboardViewer] Loading raw data...");

          // Identificar campos controlados por widgets para no duplicar filtros globales
          const fieldsWithWidgets = new Set(
            widgets
              .filter((w) => w.type === "filter" && w.filterConfig?.field)
              .map((w) => w.filterConfig!.field)
          );

          // Usar API de raw-data para evitar problemas de cache de esquema con tablas no expuestas
          const widgetFilters: AggregationFilter[] = widgets
            .filter(
              (w) =>
                w.type === "filter" &&
                filterValues[w.id] !== undefined &&
                filterValues[w.id] !== "" &&
                filterValues[w.id] !== null
            )
            .map((w) => {
              const val = filterValues[w.id];
              const isArray = Array.isArray(val);
              const originalOp = w.filterConfig?.operator || "=";
              const isSpecialOp = ["MONTH", "YEAR", "DAY"].includes(originalOp);
              return {
                id: `wf-${w.id}`,
                field: w.filterConfig?.field || "",
                operator: isArray && !isSpecialOp ? "IN" : originalOp,
                value: val,
                convertToNumber: w.filterConfig?.inputType === "number",
              };
            })
            .filter((f) => f.field !== "");

          const filters = [
            ...(!widget.excludeGlobalFilters
              ? globalFilters.filter(
                  (f) =>
                    f.value !== "" &&
                    f.value !== null &&
                    f.value !== undefined &&
                    !fieldsWithWidgets.has(f.field)
                )
              : []),
            ...widgetFilters,
            ...(aggConfig?.filters || []),
          ];

          const preparedFilters = filters.map((f) => ({
            field: f.field,
            operator: f.operator || "=",
            value: f.value,
            cast: f.convertToNumber ? "numeric" : undefined,
          }));

          const url = apiEndpoints?.rawData || "/api/dashboard/raw-data";
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableName: fullTableName,
              filters: preparedFilters,
              limit: aggConfig?.limit || 5000,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("[DashboardViewer] Raw data API error:", errorData);
            throw new Error(
              errorData?.error || "Error al cargar datos sin procesar"
            );
          }

          dataArray = await response.json();
          console.log(
            "[DashboardViewer] Raw data loaded, rows:",
            dataArray.length
          );
        }

        if (!Array.isArray(dataArray) || dataArray.length === 0) {
          console.warn("[DashboardViewer] No data returned or empty array");
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
        const aggConfig2 = widget.aggregationConfig;
        if (aggConfig2 && aggConfig2.enabled) {
          effectiveLabelField = aggConfig2.dimension;
          effectiveValueFields = aggConfig2.metrics
            .map((m) => m.alias || `${m.func}(${m.field})`)
            .filter(Boolean) as string[];
        } else {
          effectiveLabelField = widget.source?.labelField;
          effectiveValueFields = widget.source?.valueFields;
          const keys = Object.keys(sample);
          const numericKeys = keys.filter(
            (k) => typeof (sample as any)[k] === "number"
          );
          const stringKeys = keys.filter(
            (k) => typeof (sample as any)[k] === "string"
          );
          if (!effectiveLabelField)
            effectiveLabelField = stringKeys[0] || keys[0];
          if (!effectiveValueFields || effectiveValueFields.length === 0) {
            effectiveValueFields =
              numericKeys.length > 0
                ? numericKeys
                : keys.filter((k) => k !== effectiveLabelField).slice(0, 1);
          }
        }
        if (!effectiveValueFields || effectiveValueFields.length === 0) return;

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
          "#22c55e",
        ];

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
                  isLoading: false,
                  columns: columnsDetected,
                  source: {
                    ...w.source,
                    table: fullTableName,
                    etlId,
                    labelField: effectiveLabelField,
                    valueFields: effectiveValueFields,
                  },
                }
              : w
          )
        );
        console.log("[DashboardViewer] Widget updated successfully:", widgetId);
      } catch (e: any) {
        console.error("[DashboardViewer] Error cargando datos:", e);
        setWidgets((prev) =>
          prev.map((w) => (w.id === widgetId ? { ...w, isLoading: false } : w))
        );
        // Reduce noise for public viewers who might hit RLS if fallback fails
        // toast.error(e?.message || "Error al cargar o procesar los datos.");
      }
    },
    [widgets, etlData, globalFilters, filterValues]
  );

  const reloadAll = useCallback(() => {
    widgets.forEach((w) => loadETLDataIntoWidget(w.id));
  }, [widgets, loadETLDataIntoWidget]);

  // Ref para acceder al estado más reciente dentro del timeout sin añadir dependencias al efecto
  const stateRef = useRef({ widgets, loadETLDataIntoWidget });
  stateRef.current = { widgets, loadETLDataIntoWidget };

  // Efecto para recargar datos cuando cambian los filtros (debounce)
  useEffect(() => {
    console.log(
      "[DashboardViewer] filterValues changed, scheduling reload",
      filterValues
    );
    const timeoutId = setTimeout(() => {
      console.log("[DashboardViewer] Executing reload due to filter change");
      // Recargar todos los widgets que NO son de tipo filtro
      stateRef.current.widgets.forEach((w) => {
        if (w.type !== "filter") {
          stateRef.current.loadETLDataIntoWidget(w.id);
        }
      });
    }, 600);
    return () => clearTimeout(timeoutId);
  }, [filterValues]);

  // Primer auto-cargado de datos cuando llega el layout
  const initialLoadedRef = useRef(false);
  useEffect(() => {
    if (!initialLoadedRef.current && widgets.length > 0 && etlData) {
      initialLoadedRef.current = true;
      reloadAll();
    }
  }, [widgets, etlData, reloadAll]);

  // Centrar el lienzo al cargar el layout por primera vez
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

  // Reset flags when changing dashboard to ensure reload/centering on navigation
  useEffect(() => {
    initialLoadedRef.current = false;
    centeredOnceRef.current = false;
  }, [dashboardId]);

  const handleFilterChange = (widgetId: string, value: any) => {
    setFilterValues((prev) => ({ ...prev, [widgetId]: value }));
  };

  // Helper para capturar la imagen del dashboard (usado para PDF y PPTX)
  const captureDashboardImage = async () => {
    console.log("[Export] Starting image capture...");

    if (!canvasRef.current) {
      console.error("[Export] No canvasRef");
      return null;
    }
    const contentElement = canvasRef.current.children[1] as HTMLElement;
    if (!contentElement) {
      console.error("[Export] No contentElement found");
      return null;
    }

    if (widgets.length === 0) {
      toast.warning("No hay widgets para exportar");
      return null;
    }

    // Calcular dimensiones
    const minX = Math.min(...widgets.map((w) => w.x));
    const minY = Math.min(...widgets.map((w) => w.y));
    const maxX = Math.max(...widgets.map((w) => w.x + w.w));
    const maxY = Math.max(...widgets.map((w) => w.y + w.h));

    const margin = 50;
    const width = maxX - minX + margin * 2;
    const height = maxY - minY + margin * 2;

    // Contenedor temporal
    const exportContainer = document.createElement("div");
    exportContainer.style.position = "fixed";
    exportContainer.style.left = "-10000px";
    exportContainer.style.top = "0";
    exportContainer.style.width = `${width}px`;
    exportContainer.style.height = `${height}px`;
    exportContainer.style.backgroundColor = "#ffffff";
    exportContainer.style.zIndex = "-9999";
    document.body.appendChild(exportContainer);

    try {
      toast.info("Generando captura...");

      const clonedWrapper = contentElement.cloneNode(true) as HTMLElement;
      clonedWrapper.style.transform = "none";
      clonedWrapper.style.width = "100%";
      clonedWrapper.style.height = "100%";
      clonedWrapper.style.position = "relative";
      clonedWrapper.style.overflow = "visible";

      exportContainer.appendChild(clonedWrapper);

      const clonedChildren = Array.from(
        clonedWrapper.children
      ) as HTMLElement[];

      clonedChildren.forEach((child) => {
        const currentLeft = parseFloat(child.style.left || "0");
        const currentTop = parseFloat(child.style.top || "0");
        child.style.left = `${currentLeft - minX + margin}px`;
        child.style.top = `${currentTop - minY + margin}px`;
      });

      // Rehidratar canvas
      const originalCanvases = contentElement.querySelectorAll("canvas");
      const clonedCanvases = clonedWrapper.querySelectorAll("canvas");

      originalCanvases.forEach((origCanvas, index) => {
        const destCanvas = clonedCanvases[index];
        if (destCanvas) {
          const ctx = destCanvas.getContext("2d");
          if (ctx) {
            destCanvas.width = origCanvas.width;
            destCanvas.height = origCanvas.height;
            destCanvas.style.width = origCanvas.style.width;
            destCanvas.style.height = origCanvas.style.height;
            ctx.drawImage(origCanvas, 0, 0);
          }
        }
      });

      await new Promise((r) => setTimeout(r, 100));

      const canvas = await html2canvas(exportContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        width: width,
        height: height,
        windowWidth: width,
        windowHeight: height,
      });

      const imgData = canvas.toDataURL("image/png");
      return { imgData, width, height };
    } catch (e) {
      console.error("[Export] Capture error:", e);
      return null;
    } finally {
      document.body.removeChild(exportContainer);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const result = await captureDashboardImage();
      if (!result) return;

      const { imgData, width, height } = result;
      const orientation = width > height ? "l" : "p";
      const pdf = new jsPDF({
        orientation: orientation,
        unit: "px",
        format: [width, height],
      });

      pdf.addImage(imgData, "PNG", 0, 0, width, height);
      pdf.save(`${title || "dashboard"}.pdf`);
      toast.success("PDF generado con éxito");
    } catch (e) {
      console.error("[PDF] Error:", e);
      toast.error("Error generando PDF");
    }
  };

  const handleDownloadPPTX = async () => {
    try {
      const result = await captureDashboardImage();
      if (!result) return;

      const { imgData, width, height } = result;

      const PptxGenJS = (await import("pptxgenjs")).default;

      const pptx = new PptxGenJS();
      const slide = pptx.addSlide();

      // PPTX usa pulgadas por defecto. Convertimos px a pulgadas (aprox 96dpi)
      // O ajustamos el tamaño del slide al tamaño de la imagen
      // pptxgenjs permite definir layout personalizado.

      // Definir layout basado en la imagen (pulgadas)
      const dpi = 96;
      const wInches = width / dpi;
      const hInches = height / dpi;

      pptx.defineLayout({ name: "CUSTOM", width: wInches, height: hInches });
      pptx.layout = "CUSTOM";

      slide.addImage({
        data: imgData,
        x: 0,
        y: 0,
        w: wInches,
        h: hInches,
      });

      await pptx.writeFile({ fileName: `${title || "dashboard"}.pptx` });
      toast.success("PPTX generado con éxito");
    } catch (e) {
      console.error("[PPTX] Error:", e);
      toast.error("Error generando PPTX");
    }
  };

  const handleDownloadExcel = async () => {
    if (!widgets.length) {
      toast.warning("No hay widgets para exportar");
      return;
    }

    try {
      toast.info("Generando Excel...");
      const wb = XLSX.utils.book_new();
      let hasData = false;

      // Iterar widgets para encontrar datos
      for (const w of widgets) {
        if (w.type === "table" && w.rows && w.rows.length > 0) {
          // Flatten rows if needed or just dump.
          const ws = XLSX.utils.json_to_sheet(w.rows);
          // Nombre de hoja seguro (max 31 chars)
          const sheetName = (w.title || w.id)
            .replace(/[\\/?*[\]]/g, "")
            .substring(0, 31);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
          hasData = true;
        } else if (
          w.config &&
          w.config.datasets &&
          w.config.datasets.length > 0
        ) {
          // Convertir gráfico a tabla
          const labels = w.config.labels || [];
          const data: any[] = [];

          labels.forEach((label: string, idx: number) => {
            const row: any = { Label: label };
            w.config?.datasets.forEach((ds) => {
              row[ds.label || "Value"] = ds.data[idx];
            });
            data.push(row);
          });

          if (data.length > 0) {
            const ws = XLSX.utils.json_to_sheet(data);
            const sheetName = (w.title || w.id)
              .replace(/[\\/?*[\]]/g, "")
              .substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            hasData = true;
          }
        }
      }

      if (!hasData) {
        toast.warning("No se encontraron datos tabulares para exportar");
        return;
      }

      XLSX.writeFile(wb, `${title || "dashboard"}.xlsx`);
      toast.success("Excel generado con éxito");
    } catch (e) {
      console.error("[Excel] Error:", e);
      toast.error("Error generando Excel");
    }
  };

  const handleDownloadCSV = async () => {
    if (!widgets.length) {
      toast.warning("No hay widgets para exportar");
      return;
    }

    try {
      toast.info("Generando CSVs...");
      const zip = new JSZip();
      let hasData = false;

      for (const w of widgets) {
        let csvContent = "";

        if (w.type === "table" && w.rows && w.rows.length > 0) {
          const ws = XLSX.utils.json_to_sheet(w.rows);
          csvContent = XLSX.utils.sheet_to_csv(ws);
        } else if (
          w.config &&
          w.config.datasets &&
          w.config.datasets.length > 0
        ) {
          const labels = w.config.labels || [];
          const data: any[] = [];
          labels.forEach((label: string, idx: number) => {
            const row: any = { Label: label };
            w.config?.datasets.forEach((ds) => {
              row[ds.label || "Value"] = ds.data[idx];
            });
            data.push(row);
          });
          if (data.length > 0) {
            const ws = XLSX.utils.json_to_sheet(data);
            csvContent = XLSX.utils.sheet_to_csv(ws);
          }
        }

        if (csvContent) {
          const filename = `${(w.title || w.id).replace(/[\\/]/g, "_")}.csv`;
          zip.file(filename, csvContent);
          hasData = true;
        }
      }

      if (!hasData) {
        toast.warning("No se encontraron datos para exportar");
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${title || "dashboard"}_data.zip`);
      toast.success("ZIP generado con éxito");
    } catch (e) {
      console.error("[CSV] Error:", e);
      toast.error("Error generando CSV/ZIP");
    }
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-0 h-full w-full">
      <header className="flex items-center justify-between bg-white border rounded-2xl p-4 z-10">
        <div>
          <h2 className="text-xl font-semibold text-emerald-600">{title}</h2>
          <p className="text-xs text-gray-500">Vista de solo lectura</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={handleZoomOut}>
              −
            </Button>
            <Button variant="outline" size="sm" onClick={handleZoomIn}>
              +
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Formatos de Exportación</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDownloadPDF}>
                Exportar como PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadPPTX}>
                Exportar como PowerPoint (PPTX)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDownloadExcel}>
                Exportar Datos (Excel)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadCSV}>
                Exportar Datos (CSV/ZIP)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/${dashboardId}`}>Volver al Editor</Link>
          </Button>
          <Dialog open={globalDialogOpen} onOpenChange={setGlobalDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="default">Filtros Globales</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Filtros globales</DialogTitle>
                <DialogDescription>
                  Aplica filtros a todos los widgets visibles.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {/* Botones de añadir/limpiar eliminados para viewer */}
                  <Button
                    size="sm"
                    onClick={() => {
                      reloadAll();
                      setGlobalDialogOpen(false);
                    }}
                    disabled={!etlData || globalFilters.length === 0}
                  >
                    Aplicar a todos
                  </Button>
                </div>
                {globalFilters.length === 0 ? (
                  <div className="text-sm text-gray-500">
                    Sin filtros globales configurados.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[60vh] overflow-auto border rounded-md p-3 bg-gray-50">
                    {globalFilters.map((f) => (
                      <div
                        key={f.id}
                        className="grid grid-cols-12 gap-2 items-center"
                      >
                        <div className="col-span-5">
                          <select
                            disabled
                            value={f.field}
                            className="w-full text-xs border-gray-300 rounded-md bg-gray-100 shadow-sm h-8"
                          >
                            {(etlData?.fields?.all || []).map((n: string) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-3">
                          <select
                            disabled
                            value={f.operator}
                            className="w-full text-xs border-gray-300 rounded-md bg-gray-100 shadow-sm h-8"
                          >
                            <option value="=">Igual (=)</option>
                            <option value=">">Mayor (&gt;)</option>
                            <option value=">=">Mayor o igual (&gt;=)</option>
                            <option value="<">Menor (&lt;)</option>
                            <option value="<=">Menor o igual (&lt;=)</option>
                            <option value="!=">Distinto (!=)</option>
                            <option value="LIKE">Contiene (LIKE)</option>
                            <option value="ILIKE">Contiene (ILIKE)</option>
                            <option value="IN">En lista (IN)</option>
                            <option value="BETWEEN">Entre (BETWEEN)</option>
                            <option value="MONTH">Mes (1-12)</option>
                            <option value="YEAR">Año</option>
                            <option value="DAY">Día específico</option>
                            <option value="IS">Es NULL</option>
                            <option value="IS NOT">No es NULL</option>
                          </select>
                        </div>
                        <div className="col-span-3">
                          {(f as any).inputType === "select" ? (
                            <select
                              className="h-8 text-xs w-full border rounded-md px-2"
                              value={f.value || ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setGlobalFilters((prev) =>
                                  prev.map((x) =>
                                    x.id === f.id ? { ...x, value: v } : x
                                  )
                                );
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
                          ) : f.operator === "YEAR" ? (
                            <input
                              type="number"
                              className="h-8 text-xs w-full border rounded-md px-2"
                              placeholder="Ej: 2023"
                              value={f.value || ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setGlobalFilters((prev) =>
                                  prev.map((x) =>
                                    x.id === f.id ? { ...x, value: v } : x
                                  )
                                );
                              }}
                            />
                          ) : (f as any).inputType === "date" ? (
                            <input
                              type="date"
                              className="h-8 text-xs w-full border rounded-md px-2"
                              value={f.value || ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setGlobalFilters((prev) =>
                                  prev.map((x) =>
                                    x.id === f.id ? { ...x, value: v } : x
                                  )
                                );
                              }}
                            />
                          ) : (f as any).inputType === "number" ? (
                            <input
                              type="number"
                              className="h-8 text-xs w-full border rounded-md px-2"
                              placeholder="Valor"
                              value={f.value || ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setGlobalFilters((prev) =>
                                  prev.map((x) =>
                                    x.id === f.id ? { ...x, value: v } : x
                                  )
                                );
                              }}
                            />
                          ) : (
                            <input
                              className="h-8 text-xs w-full border rounded-md px-2"
                              placeholder="Valor"
                              value={
                                f.value == null
                                  ? ""
                                  : Array.isArray(f.value)
                                  ? f.value.join(",")
                                  : String(f.value)
                              }
                              onChange={(e) => {
                                const v = e.target.value;
                                setGlobalFilters((prev) =>
                                  prev.map((x) =>
                                    x.id === f.id ? { ...x, value: v } : x
                                  )
                                );
                              }}
                            />
                          )}
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => pinFilterToCanvas(f)}
                            title="Añadir al lienzo"
                          >
                            📌
                          </Button>
                        </div>
                      </div>
                    ))}
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
                    reloadAll();
                    setGlobalDialogOpen(false);
                  }}
                >
                  Aplicar y cerrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <section className="col-span-12 flex-1">
        <div
          ref={canvasRef}
          onWheel={onCanvasWheel}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerUp}
          className="bg-white/60 rounded-2xl p-6 min-h-[700px] h-full border relative overflow-hidden"
        >
          <div
            className="absolute inset-0 pointer-events-none bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] rounded-2xl"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "top left",
            }}
          />
          <div
            className="relative"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            {widgets.map((w) => {
              const isFilterList =
                w.type === "filter" && filterDisplayModes[w.id] === "list";
              const isImage = w.type === "image";

              // For image widgets, render without Card wrapper
              if (isImage) {
                return (
                  <div
                    key={w.id}
                    data-id={w.id}
                    className="absolute flex items-center justify-center overflow-hidden"
                    style={{
                      left: w.x,
                      top: w.y,
                      width: w.w,
                      height: w.h,
                    }}
                    onPointerDown={(e) => {
                      startDragWidget(w.id, e);
                    }}
                  >
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
                          objectFit: w.imageConfig?.objectFit || "contain",
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                        Sin imagen
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Card
                  key={w.id}
                  data-id={w.id}
                  className="absolute rounded-2xl shadow-sm border overflow-hidden"
                  style={{
                    left: w.x,
                    top: w.y,
                    width: w.w,
                    height: isFilterList ? "auto" : w.h,
                    minHeight: w.h,
                    zIndex: isFilterList ? 50 : undefined,
                  }}
                  onPointerDown={(e) => {
                    // Permitir drag si no es un control interactivo
                    if (
                      !(e.target as HTMLElement).closest("button") &&
                      !(e.target as HTMLElement).closest("input") &&
                      !(e.target as HTMLElement).closest("select")
                    ) {
                      startDragWidget(w.id, e);
                    }
                  }}
                >
                  <div className="px-3 py-2 text-sm flex items-center justify-between bg-white/70 cursor-grab active:cursor-grabbing">
                    <span className="font-medium text-gray-700 truncate">
                      {w.title || w.type.toUpperCase()}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        className="h-6 w-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRenameDialog(w);
                        }}
                        title="Renombrar"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="h-7 px-2 rounded-full hover:bg-gray-100 text-xs text-gray-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          loadETLDataIntoWidget(w.id);
                        }}
                      >
                        Recargar
                      </button>
                      <button
                        className="h-6 w-6 rounded-full hover:bg-red-50 flex items-center justify-center text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveWidget(w.id);
                        }}
                        title="Quitar"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-[calc(100%-36px)] bg-white flex flex-col p-2 relative">
                    {w.isLoading && (
                      <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                      </div>
                    )}
                    {(() => {
                      if (
                        !w.config &&
                        w.type !== "table" &&
                        w.type !== "filter" &&
                        w.type !== "image" &&
                        w.type !== "text"
                      ) {
                        return (
                          <div className="text-xs text-gray-500">
                            Sin datos. Usa Recargar para cargar.
                          </div>
                        );
                      }
                      if (w.type === "filter") {
                        const fConfig = w.filterConfig;
                        const isListMode = filterDisplayModes[w.id] === "list";
                        return (
                          <div className="w-full h-full flex flex-col gap-1 justify-center px-2 relative">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-medium text-gray-700">
                                {fConfig?.label || "Filtro"}
                              </label>
                              {fConfig?.inputType === "select" && (
                                <button
                                  className="p-1 hover:bg-gray-100 rounded text-gray-500 cursor-pointer"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFilterDisplayModes((prev) => ({
                                      ...prev,
                                      [w.id]: isListMode ? "select" : "list",
                                    }));
                                    // Reset value when switching modes to avoid type mismatch
                                    handleFilterChange(w.id, "");
                                  }}
                                  title={
                                    isListMode
                                      ? "Cambiar a lista desplegable"
                                      : "Cambiar a selección múltiple"
                                  }
                                >
                                  {isListMode ? (
                                    <List size={14} />
                                  ) : (
                                    <CheckSquare size={14} />
                                  )}
                                </button>
                              )}
                            </div>
                            {fConfig?.operator === "MONTH" ? (
                              isListMode ? (
                                <div className="w-full border rounded bg-white p-1 space-y-1">
                                  {[
                                    { v: "1", l: "Enero" },
                                    { v: "2", l: "Febrero" },
                                    { v: "3", l: "Marzo" },
                                    { v: "4", l: "Abril" },
                                    { v: "5", l: "Mayo" },
                                    { v: "6", l: "Junio" },
                                    { v: "7", l: "Julio" },
                                    { v: "8", l: "Agosto" },
                                    { v: "9", l: "Septiembre" },
                                    { v: "10", l: "Octubre" },
                                    { v: "11", l: "Noviembre" },
                                    { v: "12", l: "Diciembre" },
                                  ].map((opt) => {
                                    const valStr = opt.v;
                                    const currentVal = filterValues[w.id];
                                    const isChecked = Array.isArray(currentVal)
                                      ? currentVal.includes(valStr)
                                      : currentVal === valStr;
                                    return (
                                      <label
                                        key={opt.v}
                                        className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1 rounded"
                                      >
                                        <input
                                          type="checkbox"
                                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            const checked = e.target.checked;
                                            let newVal = Array.isArray(
                                              currentVal
                                            )
                                              ? [...currentVal]
                                              : currentVal
                                              ? [currentVal]
                                              : [];
                                            if (checked) {
                                              newVal.push(valStr);
                                            } else {
                                              newVal = newVal.filter(
                                                (v: string) => v !== valStr
                                              );
                                            }
                                            handleFilterChange(w.id, newVal);
                                          }}
                                        />
                                        <span className="truncate">
                                          {opt.l}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : (
                                <select
                                  className="w-full text-xs border rounded h-8 bg-white px-2"
                                  value={
                                    Array.isArray(filterValues[w.id])
                                      ? ""
                                      : filterValues[w.id] || ""
                                  }
                                  onChange={(e) =>
                                    handleFilterChange(w.id, e.target.value)
                                  }
                                >
                                  <option value="">Todos</option>
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
                              )
                            ) : fConfig?.inputType === "select" ? (
                              isListMode ? (
                                <div className="w-full border rounded bg-white p-1 space-y-1">
                                  {(w.facetValues?.[fConfig.field] || []).map(
                                    (opt: any, i: number) => {
                                      const valStr = String(opt);
                                      const currentVal = filterValues[w.id];
                                      const isChecked = Array.isArray(
                                        currentVal
                                      )
                                        ? currentVal.includes(valStr)
                                        : currentVal === valStr;
                                      return (
                                        <label
                                          key={i}
                                          className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1 rounded"
                                        >
                                          <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                            checked={isChecked}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              const checked = e.target.checked;
                                              let newVal = Array.isArray(
                                                currentVal
                                              )
                                                ? [...currentVal]
                                                : currentVal
                                                ? [currentVal]
                                                : [];
                                              if (checked) {
                                                newVal.push(valStr);
                                              } else {
                                                newVal = newVal.filter(
                                                  (v: string) => v !== valStr
                                                );
                                              }
                                              handleFilterChange(w.id, newVal);
                                            }}
                                          />
                                          <span className="truncate">
                                            {valStr}
                                          </span>
                                        </label>
                                      );
                                    }
                                  )}
                                </div>
                              ) : (
                                <select
                                  className="w-full text-xs border rounded h-8 bg-white px-2"
                                  value={
                                    Array.isArray(filterValues[w.id])
                                      ? ""
                                      : filterValues[w.id] || ""
                                  }
                                  onChange={(e) =>
                                    handleFilterChange(w.id, e.target.value)
                                  }
                                >
                                  <option value="">Todos</option>
                                  {(w.facetValues?.[fConfig.field] || []).map(
                                    (opt: any, i: number) => (
                                      <option key={i} value={String(opt)}>
                                        {String(opt)}
                                      </option>
                                    )
                                  )}
                                </select>
                              )
                            ) : fConfig?.inputType === "date" ? (
                              <input
                                type="date"
                                className="w-full text-xs border rounded h-8 px-2"
                                value={filterValues[w.id] || ""}
                                onChange={(e) =>
                                  handleFilterChange(w.id, e.target.value)
                                }
                              />
                            ) : (
                              <input
                                type={
                                  fConfig?.inputType === "number"
                                    ? "number"
                                    : "text"
                                }
                                className="w-full text-xs border rounded h-8 px-2"
                                placeholder="Valor..."
                                value={filterValues[w.id] || ""}
                                onChange={(e) =>
                                  handleFilterChange(w.id, e.target.value)
                                }
                              />
                            )}
                          </div>
                        );
                      }
                      if (["bar", "combo"].includes(w.type)) {
                        return (
                          <Bar
                            data={w.config as any}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: true },
                                datalabels: {
                                  display: true,
                                  color: "#374151",
                                  font: { weight: "bold" },
                                  formatter: (value) =>
                                    Number(value).toLocaleString(),
                                },
                              },
                            }}
                          />
                        );
                      }
                      if (w.type === "horizontalBar") {
                        return (
                          <Bar
                            data={w.config as any}
                            options={{
                              indexAxis: "y",
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: true },
                                datalabels: {
                                  display: true,
                                  color: "#374151",
                                  font: { weight: "bold" },
                                  formatter: (value) =>
                                    Number(value).toLocaleString(),
                                },
                              },
                            }}
                          />
                        );
                      }
                      if (w.type === "line") {
                        return (
                          <Line
                            data={w.config as any}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: true },
                                datalabels: {
                                  display: true,
                                  color: "#374151",
                                  font: { weight: "bold" },
                                  formatter: (value) =>
                                    Number(value).toLocaleString(),
                                },
                              },
                            }}
                          />
                        );
                      }
                      if (w.type === "pie") {
                        return (
                          <Pie
                            data={w.config as any}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: true },
                                datalabels: {
                                  display: true,
                                  color: "#ffffff",
                                  font: { weight: "bold" },
                                  formatter: (value, ctx) => {
                                    // Default to percent for Pie/Doughnut unless explicitly set to 'value'
                                    const mode =
                                      w.labelDisplayMode || "percent";
                                    if (mode === "value") {
                                      return Number(value).toLocaleString();
                                    }
                                    const dataset = ctx.chart.data.datasets[0];
                                    const total = dataset.data.reduce(
                                      (a: any, b: any) => Number(a) + Number(b),
                                      0
                                    );
                                    const percentage =
                                      (
                                        (Number(value) / Number(total)) *
                                        100
                                      ).toFixed(1) + "%";
                                    return percentage;
                                  },
                                },
                              },
                            }}
                          />
                        );
                      }
                      if (w.type === "doughnut") {
                        return (
                          <Doughnut
                            data={w.config as any}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: true },
                                datalabels: {
                                  display: true,
                                  color: "#ffffff",
                                  font: { weight: "bold" },
                                  formatter: (value, ctx) => {
                                    // Default to percent for Pie/Doughnut unless explicitly set to 'value'
                                    const mode =
                                      w.labelDisplayMode || "percent";
                                    if (mode === "value") {
                                      return Number(value).toLocaleString();
                                    }
                                    const dataset = ctx.chart.data.datasets[0];
                                    const total = dataset.data.reduce(
                                      (a: any, b: any) => Number(a) + Number(b),
                                      0
                                    );
                                    const percentage =
                                      (
                                        (Number(value) / Number(total)) *
                                        100
                                      ).toFixed(1) + "%";
                                    return percentage;
                                  },
                                },
                              },
                            }}
                          />
                        );
                      }
                      if (w.type === "text") {
                        return (
                          <div className="w-full h-full p-2 overflow-auto prose prose-sm max-w-none">
                            <div
                              dangerouslySetInnerHTML={{
                                __html: w.content || "",
                              }}
                            />
                          </div>
                        );
                      }
                      if (w.type === "image") {
                        return (
                          <div className="w-full h-full flex items-center justify-center overflow-hidden">
                            {w.content ? (
                              <img
                                src={w.content}
                                alt={w.title || "Imagen"}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <div className="text-sm text-gray-400">
                                Sin imagen
                              </div>
                            )}
                          </div>
                        );
                      }
                      if (w.type === "kpi") {
                        const value = w.config?.datasets?.[0]?.data?.[0] ?? 0;
                        return (
                          <div className="w-full h-full flex flex-col items-center justify-center">
                            <div className="text-4xl font-bold text-gray-800">
                              {Number(value).toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {w.config?.datasets?.[0]?.label || "Total"}
                            </div>
                          </div>
                        );
                      }
                      if (w.type === "table") {
                        const cols = w.columns || [];
                        const rows = w.rows || [];
                        return (
                          <div className="overflow-auto">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr className="border-b bg-gray-50">
                                  {cols.map((c) => (
                                    <th
                                      key={c.name}
                                      className="text-left px-2 py-1 font-medium text-gray-600"
                                    >
                                      {c.name}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows
                                  .slice(0, 100)
                                  .map((r: any, idx: number) => (
                                    <tr key={idx} className="border-b">
                                      {cols.map((c) => (
                                        <td
                                          key={c.name}
                                          className="px-2 py-1 text-gray-700"
                                        >
                                          {String(r?.[c.name] ?? "")}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                            {rows.length > 100 && (
                              <div className="text-[11px] text-gray-500 mt-1">
                                Mostrando 100 primeras filas.
                              </div>
                            )}
                          </div>
                        );
                      }

                      return null;
                    })()}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <Dialog
        open={!!widgetToRename}
        onOpenChange={(open) => !open && setWidgetToRename(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renombrar Widget</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label>Nuevo título</Label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWidgetToRename(null)}>
              Cancelar
            </Button>
            <Button onClick={saveRename}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DashboardViewer;
