"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { CompareSpec, CompareTemporalMode } from "@/lib/dashboard/compareSpec";
import type { DateGranularity } from "@/lib/dashboard/dateFormatting";
import { dimensionsListFromAgg, pickDateGroupBySourceField } from "@/lib/dashboard/dateGroupBySourceField";
import type { DashboardComparePlacement, DashboardCompareUi } from "@/lib/dashboard/compareDisplayKeys";
import { normalizeComparePlacements } from "@/lib/dashboard/compareDisplayKeys";

const PLACEMENT_OPTIONS: { value: DashboardComparePlacement; label: string }[] = [
  { value: "kpi_below", label: "KPI (bajo el valor)" },
  { value: "table_extra_columns", label: "Tabla (columnas extra)" },
  { value: "line_reference_series", label: "Línea / área (serie referencia)" },
  { value: "tooltip", label: "Tooltip del gráfico" },
  { value: "detail_card", label: "Tarjeta de detalle" },
];

export type DashboardCompareAggSlice = {
  enabled: boolean;
  metrics: Array<{ id: string; field: string; func: string; alias: string }>;
  compare?: CompareSpec;
  comparePeriod?: "previous_year" | "previous_month";
  compareFixedValue?: number;
  transformCompare?: string;
  transformCompareFixedValue?: string;
  transformShowDelta?: boolean;
  transformShowDeltaPct?: boolean;
  transformShowAccum?: boolean;
  dateDimension?: string;
  dateGroupByGranularity?: DateGranularity;
  dimension?: string;
  dimensions?: string[];
  dimension2?: string;
  dashboardCompareUi?: DashboardCompareUi;
};

export type SavedMetricWithOptionalAgg = {
  id: string;
  name: string;
  metric: unknown;
  aggregationConfig?: Record<string, unknown>;
};

function defaultCompareUi(prev?: DashboardCompareUi): DashboardCompareUi {
  return {
    enabled: prev?.enabled ?? false,
    label: prev?.label ?? "",
    showDelta: prev?.showDelta !== false,
    showDeltaPct: prev?.showDeltaPct !== false,
    placement: prev?.placement ?? ["kpi_below"],
    indicator: prev?.indicator ?? "both",
  };
}

function effectiveCompare(agg: DashboardCompareAggSlice): CompareSpec {
  const c = agg.compare;
  if (c && typeof c === "object" && "kind" in c && (c as CompareSpec).kind !== "none") {
    return c as CompareSpec;
  }
  return { kind: "none" };
}

type DashboardCompareSpecSectionProps = {
  agg: DashboardCompareAggSlice;
  updateAgg: (patch: Partial<DashboardCompareAggSlice>) => void;
  savedMetrics: SavedMetricWithOptionalAgg[];
  previewRows?: Record<string, unknown>[];
};

export function DashboardCompareSpecSection({
  agg,
  updateAgg,
  savedMetrics,
  previewRows,
}: DashboardCompareSpecSectionProps) {
  const compare = effectiveCompare(agg);
  const ui = defaultCompareUi(agg.dashboardCompareUi);
  const dims = dimensionsListFromAgg(agg);
  const timeColumnDefault = pickDateGroupBySourceField(agg) || agg.dateDimension?.trim() || dims[0] || "";
  const granularity = (agg.dateGroupByGranularity ?? "month") as DateGranularity;

  const savedWithCompare = useMemo(
    () =>
      savedMetrics.filter((s) => {
        const raw = s.aggregationConfig as { compare?: CompareSpec } | undefined;
        const c = raw?.compare;
        return c && typeof c === "object" && "kind" in c && c.kind !== "none";
      }),
    [savedMetrics]
  );

  const compareColumnCandidates = useMemo(() => {
    const fromRow = previewRows?.[0] && typeof previewRows[0] === "object" ? Object.keys(previewRows[0] as object) : [];
    const metricAliases = (agg.metrics ?? []).map((m) => String(m.alias || "").trim()).filter(Boolean);
    const fields = (agg.metrics ?? []).map((m) => String(m.field || "").trim()).filter(Boolean);
    return Array.from(new Set([...metricAliases, ...fields, ...dims, ...fromRow])).filter(Boolean);
  }, [agg.metrics, dims, previewRows]);

  const placements = normalizeComparePlacements(ui.placement);
  const togglePlacement = (p: DashboardComparePlacement, checked: boolean) => {
    const set = new Set(normalizeComparePlacements(ui.placement));
    if (checked) set.add(p);
    else set.delete(p);
    const next = Array.from(set) as DashboardComparePlacement[];
    updateAgg({
      dashboardCompareUi: {
        ...ui,
        placement: next.length ? next : ["kpi_below"],
      },
    });
  };

  const setCompare = (next: CompareSpec) => {
    const patch: Partial<DashboardCompareAggSlice> = { compare: next.kind === "none" ? undefined : next };
    if (next.kind !== "none") {
      patch.dashboardCompareUi = { ...ui, enabled: ui.enabled || true };
    }
    updateAgg(patch);
  };

  const applySavedCompare = (id: string) => {
    const saved = savedMetrics.find((s) => s.id === id);
    if (!saved?.aggregationConfig) return;
    const cfg = saved.aggregationConfig as DashboardCompareAggSlice;
    updateAgg({
      compare: cfg.compare,
      comparePeriod: cfg.comparePeriod,
      compareFixedValue: cfg.compareFixedValue,
      transformCompare: cfg.transformCompare,
      transformCompareFixedValue: cfg.transformCompareFixedValue,
      transformShowDelta: cfg.transformShowDelta,
      transformShowDeltaPct: cfg.transformShowDeltaPct,
      transformShowAccum: cfg.transformShowAccum,
      dateDimension: cfg.dateDimension ?? agg.dateDimension,
      dateGroupByGranularity: cfg.dateGroupByGranularity ?? agg.dateGroupByGranularity,
      dashboardCompareUi: defaultCompareUi({
        ...(cfg.dashboardCompareUi as DashboardCompareUi | undefined),
        enabled: true,
      }),
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)]/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Comparación (análisis / transformaciones)</Label>
      </div>

      {savedWithCompare.length > 0 && (
        <div>
          <Label className="text-[11px] text-[var(--studio-fg-muted)]">Copiar de métrica guardada con comparación</Label>
          <select
            className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              applySavedCompare(id);
              e.target.value = "";
            }}
          >
            <option value="">Elegir…</option>
            {savedWithCompare.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-[var(--studio-fg-muted)]">
            Copia la definición de comparación al widget (queda persistida en el dashboard).
          </p>
        </div>
      )}

      <div>
        <Label className="text-[11px] text-[var(--studio-fg-muted)]">Tipo de comparación</Label>
        <select
          className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
          value={compare.kind}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "none") {
              setCompare({ kind: "none" });
              return;
            }
            if (v === "temporal") {
              if (!timeColumnDefault) return;
              setCompare({
                kind: "temporal",
                mode: "prev_bucket",
                timeColumn: timeColumnDefault,
                granularity,
              });
              return;
            }
            if (v === "column") {
              const first = compareColumnCandidates[0] ?? "";
              if (!first) return;
              setCompare({ kind: "column", refColumn: first });
              return;
            }
            if (v === "fixed") {
              const n = Number.parseFloat(String(agg.transformCompareFixedValue ?? ""));
              setCompare(Number.isFinite(n) ? { kind: "fixed", value: n } : { kind: "none" });
              return;
            }
            if (v === "average") {
              setCompare({ kind: "average", scope: "global", partitionDimensions: [] });
              return;
            }
            if (v === "total_share") {
              setCompare({ kind: "total_share", partitionDimensions: [] });
              return;
            }
            if (v === "cumulative") {
              if (!timeColumnDefault) return;
              setCompare({
                kind: "cumulative",
                mode: "month_vs_ytd",
                timeColumn: timeColumnDefault,
                granularity,
              });
            }
          }}
        >
          <option value="none">Ninguna</option>
          <option value="temporal">Temporal</option>
          <option value="column">Otra columna del resultado</option>
          <option value="fixed">Valor fijo</option>
          <option value="average">Promedio</option>
          <option value="total_share">Participación sobre total</option>
          <option value="cumulative">Acumulados (YTD)</option>
        </select>
      </div>

      {compare.kind === "temporal" && (
        <div className="space-y-2">
          <Label className="text-[11px] text-[var(--studio-fg-muted)]">Modo temporal</Label>
          <select
            className="w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
            value={compare.mode}
            onChange={(e) => {
              const mode = e.target.value as CompareTemporalMode;
              if (!timeColumnDefault) return;
              setCompare({
                kind: "temporal",
                mode,
                timeColumn: timeColumnDefault,
                granularity: compare.granularity,
              });
            }}
          >
            <option value="prev_bucket">Período anterior en la serie</option>
            <option value="same_period_prior_year">Mismo período, año anterior</option>
            <option value="calendar_prev_day">Día calendario anterior</option>
            <option value="calendar_prev_week">Semana calendario anterior</option>
            <option value="calendar_prev_month">Mes calendario anterior</option>
            <option value="calendar_prev_year">Año calendario anterior</option>
          </select>
        </div>
      )}

      {compare.kind === "column" && (
        <div>
          <Label className="text-[11px] text-[var(--studio-fg-muted)]">Columna de referencia</Label>
          <select
            className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
            value={compare.refColumn}
            onChange={(e) => setCompare({ kind: "column", refColumn: e.target.value })}
          >
            {compareColumnCandidates.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      {compare.kind === "fixed" && (
        <div>
          <Label className="text-[11px] text-[var(--studio-fg-muted)]">Valor fijo</Label>
          <Input
            type="text"
            className="mt-0.5 h-8 text-xs border-[var(--studio-border)]"
            value={String(agg.transformCompareFixedValue ?? "")}
            onChange={(e) => {
              updateAgg({ transformCompareFixedValue: e.target.value });
              const n = Number.parseFloat(e.target.value);
              if (Number.isFinite(n)) setCompare({ kind: "fixed", value: n });
            }}
          />
        </div>
      )}

      {compare.kind === "average" && (
        <div className="space-y-2">
          <Label className="text-[11px] text-[var(--studio-fg-muted)]">Ámbito</Label>
          <select
            className="w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
            value={compare.scope}
            onChange={(e) => {
              const scope = e.target.value === "partition" ? "partition" : "global";
              setCompare({
                kind: "average",
                scope,
                partitionDimensions: scope === "partition" ? dims.slice(0, 1) : [],
              });
            }}
          >
            <option value="global">Promedio general</option>
            <option value="partition">Por dimensión</option>
          </select>
          {compare.scope === "partition" && (
            <div className="flex flex-wrap gap-2">
              {dims.map((d) => {
                const on = compare.partitionDimensions.includes(d);
                return (
                  <label key={d} className="flex items-center gap-1 text-[11px] text-[var(--studio-fg)]">
                    <Checkbox
                      checked={on}
                      onCheckedChange={() => {
                        const next = on
                          ? compare.partitionDimensions.filter((x) => x !== d)
                          : [...compare.partitionDimensions, d];
                        setCompare({ kind: "average", scope: "partition", partitionDimensions: next });
                      }}
                    />
                    {d}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {compare.kind === "total_share" && (
        <div className="space-y-2">
          <Label className="text-[11px] text-[var(--studio-fg-muted)]">Total por grupo (vacío = global)</Label>
          <div className="flex flex-wrap gap-2">
            {dims.map((d) => {
              const on = compare.partitionDimensions.includes(d);
              return (
                <label key={d} className="flex items-center gap-1 text-[11px] text-[var(--studio-fg)]">
                  <Checkbox
                    checked={on}
                    onCheckedChange={() => {
                      const next = on
                        ? compare.partitionDimensions.filter((x) => x !== d)
                        : [...compare.partitionDimensions, d];
                      setCompare({ kind: "total_share", partitionDimensions: next });
                    }}
                  />
                  {d}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {compare.kind === "cumulative" && (
        <div>
          <Label className="text-[11px] text-[var(--studio-fg-muted)]">Modo acumulado</Label>
          <select
            className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
            value={compare.mode}
            onChange={(e) => {
              const mode = e.target.value as "month_vs_ytd" | "vs_prior_year_ytd" | "ytd_running";
              if (!timeColumnDefault) return;
              setCompare({
                kind: "cumulative",
                mode,
                timeColumn: timeColumnDefault,
                granularity: compare.granularity,
              });
            }}
          >
            <option value="month_vs_ytd">Mes vs YTD</option>
            <option value="vs_prior_year_ytd">YTD vs año anterior</option>
            <option value="ytd_running">YTD acumulado</option>
          </select>
        </div>
      )}

      {compare.kind !== "none" && (
        <div className="space-y-3 border-t border-[var(--studio-border)] pt-3">
          <label className="flex items-center gap-2 text-xs text-[var(--studio-fg)]">
            <Checkbox
              checked={ui.enabled}
              onCheckedChange={(c) =>
                updateAgg({ dashboardCompareUi: { ...ui, enabled: c === true } })
              }
            />
            Mostrar comparación en el dashboard
          </label>
          <div>
            <Label className="text-[11px] text-[var(--studio-fg-muted)]">Texto visible (ej. vs mes anterior)</Label>
            <Input
              className="mt-0.5 h-8 text-xs border-[var(--studio-border)]"
              value={ui.label ?? ""}
              placeholder="vs periodo anterior"
              onChange={(e) => updateAgg({ dashboardCompareUi: { ...ui, label: e.target.value } })}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-[11px] text-[var(--studio-fg)]">
              <Checkbox
                checked={ui.showDelta !== false}
                onCheckedChange={(c) =>
                  updateAgg({
                    dashboardCompareUi: { ...ui, showDelta: c === true },
                    transformShowDelta: c === true,
                  })
                }
              />
              Diferencia absoluta
            </label>
            <label className="flex items-center gap-2 text-[11px] text-[var(--studio-fg)]">
              <Checkbox
                checked={ui.showDeltaPct !== false}
                onCheckedChange={(c) =>
                  updateAgg({
                    dashboardCompareUi: { ...ui, showDeltaPct: c === true },
                    transformShowDeltaPct: c === true,
                  })
                }
              />
              Variación %
            </label>
          </div>
          <div>
            <Label className="text-[11px] text-[var(--studio-fg-muted)]">Indicador suba/baja</Label>
            <select
              className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
              value={ui.indicator ?? "both"}
              onChange={(e) =>
                updateAgg({
                  dashboardCompareUi: {
                    ...ui,
                    indicator: e.target.value as DashboardCompareUi["indicator"],
                  },
                })
              }
            >
              <option value="none">Ninguno</option>
              <option value="icon">Solo ícono</option>
              <option value="color">Solo color</option>
              <option value="both">Ícono y color</option>
            </select>
          </div>
          <div>
            <Label className="text-[11px] text-[var(--studio-fg-muted)]">Dónde mostrar</Label>
            <div className="mt-1 space-y-1.5">
              {PLACEMENT_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-[11px] text-[var(--studio-fg)]">
                  <Checkbox
                    checked={placements.includes(o.value)}
                    onCheckedChange={(c) => togglePlacement(o.value, c === true)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <Label className="text-[11px] text-[var(--studio-fg-muted)]">Compatibilidad (legacy)</Label>
        <select
          className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
          value={agg.comparePeriod ?? ""}
          onChange={(e) =>
            updateAgg({
              comparePeriod: (e.target.value || undefined) as "previous_year" | "previous_month" | undefined,
            })
          }
        >
          <option value="">comparePeriod: ninguno</option>
          <option value="previous_month">Mes anterior (legacy)</option>
          <option value="previous_year">Año anterior (legacy)</option>
        </select>
      </div>
    </div>
  );
}
