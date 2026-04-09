"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Eye, EyeOff, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useDashboardEtlData } from "@/hooks/useDashboardEtlData";
import FieldSelector from "./FieldSelector";
import { DashboardViewer, type Widget } from "./DashboardViewer";
import {
  type DashboardTheme,
  DEFAULT_DASHBOARD_THEME,
  mergeTheme,
} from "@/types/dashboard";
import { safeJsonResponse } from "@/lib/safe-json-response";
import { toast } from "sonner";
import {
  clampGridSpan,
  DASHBOARD_GRID_COLUMN_COUNT,
  type DashboardFixedGrid,
} from "@/lib/dashboard/gridLayout";
import { Checkbox } from "@/components/ui/checkbox";
import { HEADER_PRESET_ICONS } from "@/lib/dashboard/headerPresetIcons";

type AggregationFilter = {
  id: string;
  field: string;
  operator: string;
  value: unknown;
  inputType?: "text" | "select" | "number" | "date";
};

type AggregationMetric = {
  id: string;
  field: string;
  func: string;
  alias: string;
};

type AggregationConfig = {
  enabled: boolean;
  dimension?: string;
  dimensions?: string[];
  metrics: AggregationMetric[];
  filters?: AggregationFilter[];
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  chartType?: string;
  chartXAxis?: string;
  chartYAxes?: string[];
};

const WIDGET_TYPES: { type: Widget["type"]; label: string }[] = [
  { type: "bar", label: "Barras" },
  { type: "horizontalBar", label: "Barras horiz." },
  { type: "line", label: "Líneas" },
  { type: "area", label: "Área" },
  { type: "pie", label: "Circular" },
  { type: "doughnut", label: "Dona" },
  { type: "kpi", label: "KPI" },
  { type: "table", label: "Tabla" },
  { type: "combo", label: "Combo" },
  { type: "filter", label: "Filtro" },
  { type: "text", label: "Texto" },
  { type: "image", label: "Imagen" },
];

const AGG_FUNCS = [
  { value: "SUM", label: "Suma" },
  { value: "AVG", label: "Promedio" },
  { value: "COUNT", label: "Conteo" },
  { value: "MIN", label: "Mínimo" },
  { value: "MAX", label: "Máximo" },
];

function createDefaultWidget(type: Widget["type"]): Widget {
  const id = `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    type,
    title:
      type === "filter"
        ? "Filtro"
        : type === "text"
          ? "Texto"
          : type === "image"
            ? "Imagen"
            : "Nuevo widget",
    x: 0,
    y: 0,
    w: 4,
    h: 2,
    gridSpan: type === "kpi" ? 1 : 2,
    minHeight: 240,
    ...(type !== "text" && type !== "filter" && type !== "image"
      ? {
          aggregationConfig: {
            enabled: true,
            dimension: "",
            metrics: [{ id: `m-${id}`, field: "", func: "SUM", alias: "" }],
            limit: 100,
            chartType: type,
          } as AggregationConfig,
        }
      : {}),
    ...(type === "text" ? { content: "" } : {}),
    ...(type === "image"
      ? {
          imageUrl: "",
          imageConfig: { objectFit: "contain" as const, opacity: 1 },
          zIndex: 0,
        }
      : {}),
  } as Widget;
}

interface DashboardEditorProps {
  dashboardId: string;
}

export function DashboardEditor({ dashboardId }: DashboardEditorProps) {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [title, setTitle] = useState("Dashboard");
  const [globalFilters, setGlobalFilters] = useState<AggregationFilter[]>([]);
  const [dashboardTheme, setDashboardTheme] = useState<DashboardTheme>(() => ({ ...DEFAULT_DASHBOARD_THEME }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [layoutLoading, setLayoutLoading] = useState(true);

  const { data: etlData } = useDashboardEtlData(dashboardId);
  const selected = widgets.find((w) => w.id === selectedId) ?? null;

  const loadLayout = useCallback(async () => {
    setLayoutLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${dashboardId}/layout`);
      const json = await safeJsonResponse(res);
      if (!res.ok || !json.ok) {
        setWidgets([]);
        setLayoutLoading(false);
        return;
      }
      const data = json.data as { layout?: { widgets?: Widget[]; theme?: Partial<DashboardTheme> }; title?: string; global_filters_config?: AggregationFilter[] };
      const layout = data.layout;
      const loadedWidgets = Array.isArray(layout?.widgets) ? layout.widgets : [];
      const loadedTheme = layout?.theme && typeof layout.theme === "object" ? layout.theme : {};
      setWidgets(loadedWidgets);
      setTitle(data.title ?? "Dashboard");
      setDashboardTheme((prev) => ({ ...DEFAULT_DASHBOARD_THEME, ...prev, ...loadedTheme }));
      setGlobalFilters(Array.isArray(data.global_filters_config) ? data.global_filters_config : []);
    } catch {
      setWidgets([]);
    } finally {
      setLayoutLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => {
    loadLayout();
  }, [loadLayout]);

  const saveLayout = useCallback(async () => {
    setIsSaving(true);
    try {
      const layout = {
        widgets: widgets.map(({ rows, config, columns, facetValues, ...rest }) => rest),
        theme: dashboardTheme,
      };
      const res = await fetch(`/api/dashboard/${dashboardId}/layout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout,
          global_filters_config: globalFilters,
          title,
        }),
      });
      const json = await safeJsonResponse(res);
      if (!res.ok || !json.ok) throw new Error(json.error || "Error al guardar");
      toast.success("Diseño guardado");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setIsSaving(false);
    }
  }, [dashboardId, widgets, dashboardTheme, globalFilters, title]);

  const addWidget = useCallback((type: Widget["type"]) => {
    const next = createDefaultWidget(type);
    setWidgets((prev) => [...prev, next]);
    setSelectedId(next.id);
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const updateWidget = useCallback((id: string, patch: Partial<Widget>) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }, []);

  const updateAggregation = useCallback((id: string, patch: Partial<AggregationConfig>) => {
    setWidgets((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const agg = (w.aggregationConfig ?? { enabled: true, metrics: [] }) as AggregationConfig;
        return { ...w, aggregationConfig: { ...agg, ...patch } };
      })
    );
  }, []);

  if (isPreviewMode) {
    return (
      <div className="relative flex h-full w-full flex-col bg-[var(--platform-bg)]">
        <div className="absolute bottom-6 right-6 z-50">
          <Button
            onClick={() => setIsPreviewMode(false)}
            variant="default"
            size="lg"
            className="rounded-full shadow-lg"
          >
            <EyeOff className="mr-2 h-4 w-4" />
            Salir de vista previa
          </Button>
        </div>
        <DashboardViewer
          dashboardId={dashboardId}
          initialWidgets={widgets}
          initialTitle={title}
          initialGlobalFilters={globalFilters}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border bg-[var(--platform-bg)] p-4" style={{ borderColor: "var(--platform-border)" }}>
      <header className="flex flex-shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--platform-fg-muted)] hover:text-[var(--platform-accent)]"
          >
            <ChevronLeft className="h-4 w-4" />
            Dashboards
          </Link>
          <span className="text-[var(--platform-fg-muted)]">/</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 w-64 border-[var(--platform-border)] bg-[var(--platform-surface)] font-semibold"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-[var(--platform-border)]"
            onClick={() => setIsPreviewMode(true)}
          >
            <Eye className="mr-2 h-4 w-4" />
            Vista previa
          </Button>
          <Button
            size="sm"
            className="bg-[var(--platform-accent)] hover:opacity-90"
            onClick={saveLayout}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 gap-4">
        <div className="flex flex-1 flex-col gap-4 overflow-auto">
          <div className="flex flex-wrap gap-2">
            {WIDGET_TYPES.map(({ type, label }) => (
              <Button
                key={type}
                variant="outline"
                size="sm"
                className="border-[var(--platform-border)]"
                onClick={() => addWidget(type)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>

          {layoutLoading ? (
            <div className="flex flex-1 items-center justify-center text-[var(--platform-fg-muted)]">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : widgets.length === 0 ? (
            <div
              className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 text-center text-sm text-[var(--platform-fg-muted)]"
              style={{ borderColor: "var(--platform-border)" }}
            >
              <p className="mb-2">No hay widgets. Añade uno desde los botones de arriba.</p>
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${DASHBOARD_GRID_COLUMN_COUNT}, minmax(0, 1fr))` }}
            >
              {widgets.map((w) => {
                const span = clampGridSpan(w.gridSpan, 2);
                return (
                  <div
                    key={w.id}
                    className="rounded-xl border-2 transition-colors"
                    style={{
                      gridColumn: `span ${span}`,
                      borderColor: selectedId === w.id ? "var(--platform-accent)" : "var(--platform-border)",
                      background: "var(--platform-surface)",
                    }}
                  >
                    <div
                      className="cursor-pointer p-3"
                      onClick={() => setSelectedId(w.id)}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="truncate font-medium text-[var(--platform-fg)]">{w.title}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[var(--platform-fg-muted)] hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeWidget(w.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-[var(--platform-fg-muted)]">
                        {w.type} {w.aggregationConfig?.dimension ? ` · ${w.aggregationConfig.dimension}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selected && (
          <aside
            className="flex w-80 flex-shrink-0 flex-col gap-4 overflow-auto rounded-xl border p-4"
            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
          >
            <h3 className="font-semibold text-[var(--platform-fg)]">Configurar widget</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-[var(--platform-fg-muted)]">Título</Label>
                <Input
                  value={selected.title}
                  onChange={(e) => updateWidget(selected.id, { title: e.target.value })}
                  className="mt-1 border-[var(--platform-border)]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-[var(--platform-fg-muted)]">Icono en cabecera</Label>
                <p className="text-[11px] text-[var(--platform-fg-muted)]">
                  Icono representativo o imagen por URL (el icono elegido tiene prioridad).
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    title="Sin icono"
                    onClick={() => updateWidget(selected.id, { headerIconKey: undefined })}
                    className={`flex h-9 min-w-[2.25rem] items-center justify-center rounded-md border px-2 text-[11px] font-medium ${
                      !selected.headerIconKey
                        ? "border-[var(--platform-accent)] bg-[var(--platform-accent)]/15 text-[var(--platform-accent)]"
                        : "border-[var(--platform-border)] text-[var(--platform-fg-muted)] hover:bg-[var(--platform-bg)]"
                    }`}
                  >
                    —
                  </button>
                  {HEADER_PRESET_ICONS.map(({ key, label, Icon }) => {
                    const active = selected.headerIconKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        title={label}
                        onClick={() =>
                          updateWidget(selected.id, {
                            headerIconKey: key,
                            headerIconUrl: undefined,
                          })
                        }
                        className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                          active
                            ? "border-[var(--platform-accent)] bg-[var(--platform-accent)]/15 text-[var(--platform-accent)]"
                            : "border-[var(--platform-border)] text-[var(--platform-fg-muted)] hover:bg-[var(--platform-bg)]"
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </button>
                    );
                  })}
                </div>
                <Input
                  value={selected.headerIconUrl ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateWidget(selected.id, {
                      headerIconUrl: v || undefined,
                      ...(v.trim() ? { headerIconKey: undefined } : {}),
                    });
                  }}
                  placeholder="O URL de imagen (https://…)"
                  className="border-[var(--platform-border)] text-sm"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--platform-fg)" }}>
                <Checkbox
                  checked={!!selected.hideWidgetHeader}
                  onCheckedChange={(c) => updateWidget(selected.id, { hideWidgetHeader: c === true })}
                />
                <span>Ocultar cabecera de la tarjeta</span>
              </label>
              <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--platform-border)" }}>
                <p className="text-xs font-medium text-[var(--platform-fg-muted)]">Layout en rejilla</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-[var(--platform-fg-muted)]">Ancho (columnas)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={DASHBOARD_GRID_COLUMN_COUNT}
                      value={clampGridSpan(selected.gridSpan, 2)}
                      onChange={(e) =>
                        updateWidget(selected.id, { gridSpan: clampGridSpan(e.target.valueAsNumber, 2) })
                      }
                      className="mt-0.5 h-8 border-[var(--platform-border)] text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-[var(--platform-fg-muted)]">Alto mín. (px)</Label>
                    <Input
                      type="number"
                      min={120}
                      max={2000}
                      value={selected.minHeight ?? 240}
                      onChange={(e) => updateWidget(selected.id, { minHeight: e.target.valueAsNumber || 240 })}
                      className="mt-0.5 h-8 border-[var(--platform-border)] text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] text-[var(--platform-fg-muted)]">z-index (capas / solapamiento)</Label>
                  <Input
                    type="number"
                    value={selected.zIndex ?? 0}
                    onChange={(e) =>
                      updateWidget(selected.id, { zIndex: Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0 })
                    }
                    className="mt-0.5 h-8 border-[var(--platform-border)] text-sm"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: "var(--platform-fg)" }}>
                  <Checkbox
                    checked={!!selected.fixedGrid}
                    onCheckedChange={(c) => {
                      if (c === true) {
                        const fg: DashboardFixedGrid = {
                          col: 1,
                          row: 1,
                          colSpan: clampGridSpan(selected.gridSpan, 2),
                          rowSpan: 4,
                        };
                        updateWidget(selected.id, { fixedGrid: fg });
                      } else {
                        updateWidget(selected.id, { fixedGrid: undefined });
                      }
                    }}
                  />
                  <span>Posición fija (columna/fila en la rejilla)</span>
                </label>
                {selected.fixedGrid && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {(["col", "row", "colSpan", "rowSpan"] as const).map((key) => (
                      <div key={key}>
                        <Label className="text-[10px] text-[var(--platform-fg-muted)]">
                          {key === "col"
                            ? "Col (1-based)"
                            : key === "row"
                              ? "Fila (1-based)"
                              : key === "colSpan"
                                ? "Span columnas"
                                : "Span filas"}
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={key === "col" || key === "colSpan" ? DASHBOARD_GRID_COLUMN_COUNT : 99}
                          value={selected.fixedGrid![key]}
                          onChange={(e) => {
                            const n = Math.max(1, e.target.valueAsNumber || 1);
                            updateWidget(selected.id, {
                              fixedGrid: { ...selected.fixedGrid!, [key]: n },
                            });
                          }}
                          className="mt-0.5 h-8 border-[var(--platform-border)] text-sm"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selected.type !== "text" && selected.type !== "filter" && selected.type !== "image" && selected.aggregationConfig && (
                <>
                  <div>
                    <Label className="text-xs text-[var(--platform-fg-muted)]">Dimensión (eje X / categoría)</Label>
                    <FieldSelector
                      label=""
                      value={selected.aggregationConfig.dimension ?? ""}
                      onChange={(v) => updateAggregation(selected.id, { dimension: v })}
                      etlData={etlData ?? null}
                      fieldType="all"
                      placeholder="Seleccionar campo"
                    />
                  </div>
                  {selected.aggregationConfig.metrics.map((m, idx) => (
                    <div key={m.id} className="space-y-1">
                      <Label className="text-xs text-[var(--platform-fg-muted)]">Métrica {idx + 1}</Label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <FieldSelector
                            label=""
                            value={m.field}
                            onChange={(v) => {
                              const metrics = [...(selected.aggregationConfig!.metrics ?? [])];
                              metrics[idx] = { ...metrics[idx], field: v, alias: v || metrics[idx].alias };
                              updateAggregation(selected.id, { metrics });
                            }}
                            etlData={etlData ?? null}
                            fieldType="numeric"
                            placeholder="Campo"
                          />
                        </div>
                        <select
                          className="h-9 rounded-md border border-[var(--platform-border)] bg-[var(--platform-bg)] px-2 text-sm"
                          value={m.func}
                          onChange={(e) => {
                            const metrics = [...(selected.aggregationConfig!.metrics ?? [])];
                            metrics[idx] = { ...metrics[idx], func: e.target.value };
                            updateAggregation(selected.id, { metrics });
                          }}
                        >
                          {AGG_FUNCS.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>
                      <Input
                        placeholder="Alias (opcional)"
                        value={m.alias}
                        onChange={(e) => {
                          const metrics = [...(selected.aggregationConfig!.metrics ?? [])];
                          metrics[idx] = { ...metrics[idx], alias: e.target.value };
                          updateAggregation(selected.id, { metrics });
                        }}
                        className="mt-1 border-[var(--platform-border)] text-sm"
                      />
                    </div>
                  ))}
                  <div>
                    <Label className="text-xs text-[var(--platform-fg-muted)]">Tipo de gráfico</Label>
                    <select
                      className="mt-1 h-9 w-full rounded-md border border-[var(--platform-border)] bg-[var(--platform-bg)] px-3 text-sm"
                      value={(selected.aggregationConfig as AggregationConfig).chartType ?? selected.type}
                      onChange={(e) => updateAggregation(selected.id, { chartType: e.target.value })}
                    >
                      {WIDGET_TYPES.filter((t) => !["filter", "text", "image"].includes(t.type)).map((t) => (
                        <option key={t.type} value={t.type}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-[var(--platform-fg-muted)]">Límite filas</Label>
                    <Input
                      type="number"
                      min={1}
                      max={5000}
                      value={(selected.aggregationConfig as AggregationConfig).limit ?? 100}
                      onChange={(e) => updateAggregation(selected.id, { limit: e.target.valueAsNumber || 100 })}
                      className="mt-1 border-[var(--platform-border)]"
                    />
                  </div>
                </>
              )}
              {selected.type === "text" && (
                <div>
                  <Label className="text-xs text-[var(--platform-fg-muted)]">Contenido</Label>
                  <textarea
                    className="mt-1 min-h-[120px] w-full rounded-md border border-[var(--platform-border)] bg-[var(--platform-bg)] p-2 text-sm"
                    value={selected.content ?? ""}
                    onChange={(e) => updateWidget(selected.id, { content: e.target.value })}
                    placeholder="Escribe aquí..."
                  />
                </div>
              )}
              {selected.type === "image" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-[var(--platform-fg-muted)]">URL de la imagen</Label>
                    <Input
                      value={selected.imageUrl ?? ""}
                      onChange={(e) => updateWidget(selected.id, { imageUrl: e.target.value })}
                      placeholder="https://… o data:image/…"
                      className="mt-1 border-[var(--platform-border)] text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-[var(--platform-fg-muted)]">Ajuste (object-fit)</Label>
                    <select
                      className="mt-1 h-9 w-full rounded-md border border-[var(--platform-border)] bg-[var(--platform-bg)] px-3 text-sm"
                      value={selected.imageConfig?.objectFit ?? "contain"}
                      onChange={(e) =>
                        updateWidget(selected.id, {
                          imageConfig: {
                            ...selected.imageConfig,
                            objectFit: e.target.value as NonNullable<typeof selected.imageConfig>["objectFit"],
                          },
                        })
                      }
                    >
                      <option value="contain">contain</option>
                      <option value="cover">cover</option>
                      <option value="fill">fill</option>
                      <option value="none">none</option>
                      <option value="scale-down">scale-down</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-[var(--platform-fg-muted)]">Ancho img (px, opc.)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={selected.imageConfig?.width ?? ""}
                        onChange={(e) =>
                          updateWidget(selected.id, {
                            imageConfig: {
                              ...selected.imageConfig,
                              width: e.target.value === "" ? undefined : e.target.valueAsNumber,
                            },
                          })
                        }
                        className="mt-1 border-[var(--platform-border)] text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-[var(--platform-fg-muted)]">Alto img (px, opc.)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={selected.imageConfig?.height ?? ""}
                        onChange={(e) =>
                          updateWidget(selected.id, {
                            imageConfig: {
                              ...selected.imageConfig,
                              height: e.target.value === "" ? undefined : e.target.valueAsNumber,
                            },
                          })
                        }
                        className="mt-1 border-[var(--platform-border)] text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-[var(--platform-fg-muted)]">Opacidad (0–1)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={selected.imageConfig?.opacity ?? 1}
                      onChange={(e) => {
                        const v = e.target.valueAsNumber;
                        updateWidget(selected.id, {
                          imageConfig: {
                            ...selected.imageConfig,
                            opacity: Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1,
                          },
                        });
                      }}
                      className="mt-1 border-[var(--platform-border)] text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default DashboardEditor;
