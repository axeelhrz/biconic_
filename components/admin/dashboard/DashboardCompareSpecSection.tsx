"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { CompareSpec } from "@/lib/dashboard/compareSpec";
import type { DateGranularity } from "@/lib/dashboard/dateFormatting";
import { dimensionsListFromAgg, pickDateGroupBySourceField } from "@/lib/dashboard/dateGroupBySourceField";
import type { DashboardComparePlacement, DashboardCompareUi } from "@/lib/dashboard/compareDisplayKeys";
import {
  normalizeComparePlacements,
  compareNeedsTimeGroupedRows,
  readComparePresentation,
  pickDashboardKpiCompareRow,
} from "@/lib/dashboard/compareDisplayKeys";
import {
  resolveDashboardKpiMainValueForScope,
  type KpiUserTimeScopeOptions,
} from "@/lib/dashboard/kpiFilterScope";
import { ensureDashboardCompareUi } from "@/lib/dashboard/ensureDashboardCompareUi";
import { formatValue } from "@/lib/dashboard/chartOptions";
import { CompareSpecFields } from "@/components/admin/dashboard/CompareSpecFields";

const PLACEMENT_OPTIONS: { value: DashboardComparePlacement; label: string }[] = [
  { value: "kpi_below", label: "KPI (bajo el valor)" },
  { value: "table_extra_columns", label: "Tabla (columnas extra)" },
  { value: "line_reference_series", label: "Línea / área (serie referencia)" },
  { value: "tooltip", label: "Tooltip del gráfico" },
  { value: "detail_card", label: "Tarjeta de detalle" },
];

const COMPARE_KIND_LABELS: Record<Exclude<CompareSpec["kind"], "none">, string> = {
  temporal: "Temporal",
  column: "Vs columna",
  fixed: "Vs valor fijo",
  average: "Vs promedio",
  total_share: "% del total",
  cumulative: "Acumulado / YTD",
};

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

function effectiveCompare(agg: DashboardCompareAggSlice): CompareSpec {
  const c = agg.compare;
  if (c && typeof c === "object" && "kind" in c && (c as CompareSpec).kind !== "none") {
    return c as CompareSpec;
  }
  return { kind: "none" };
}

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

function compareKindBadgeLabel(compare: CompareSpec): string | null {
  if (compare.kind === "none") return null;
  const base = COMPARE_KIND_LABELS[compare.kind];
  if (compare.kind === "temporal" && compare.mode) {
    const modeLabels: Record<string, string> = {
      prev_bucket: "período anterior",
      same_period_prior_year: "mismo período año anterior",
      calendar_prev_day: "día anterior",
      calendar_prev_week: "semana anterior",
      calendar_prev_month: "mes anterior",
      calendar_prev_year: "año anterior",
    };
    return `${base} · ${modeLabels[compare.mode] ?? compare.mode}`;
  }
  if (compare.kind === "cumulative" && compare.mode) {
    return `${base} · ${compare.mode}`;
  }
  return base;
}

type DashboardCompareSpecSectionProps = {
  agg: DashboardCompareAggSlice;
  updateAgg: (patch: Partial<DashboardCompareAggSlice>) => void;
  savedMetrics: SavedMetricWithOptionalAgg[];
  previewRows?: Record<string, unknown>[];
  widgetType?: string;
  kpiUserTimeScope?: KpiUserTimeScopeOptions | null;
};

function previewCompareLineText(
  previewRows: Record<string, unknown>[] | undefined,
  compare: CompareSpec,
  metricAlias: string
): string | null {
  if (!previewRows?.length || compare.kind === "none" || !metricAlias) return null;
  const row =
    pickDashboardKpiCompareRow(previewRows, compare) ??
    (previewRows[previewRows.length - 1] as Record<string, unknown>);
  const vals = readComparePresentation(compare, metricAlias, row);
  if (vals.delta == null && vals.deltaPct == null) return null;
  const parts: string[] = [];
  if (vals.delta != null) parts.push(`Δ ${formatValue(vals.delta, "none", "$", "none", 2)}`);
  if (vals.deltaPct != null) parts.push(`${formatValue(vals.deltaPct, "percent", "$", "none", 1)}`);
  return parts.length ? parts.join(" · ") : null;
}

function previewMainKpiTotal(
  previewRows: Record<string, unknown>[] | undefined,
  metricAlias: string,
  kpiUserTimeScope?: KpiUserTimeScopeOptions | null
): string | null {
  if (!previewRows?.length || !metricAlias) return null;
  const total = resolveDashboardKpiMainValueForScope(previewRows, metricAlias, kpiUserTimeScope ?? null);
  if (!Number.isFinite(total)) return null;
  const abs = Math.abs(total);
  const scale = abs >= 1_000_000_000 ? "Bi" : abs >= 1_000_000 ? "M" : abs >= 1_000 ? "K" : "none";
  return formatValue(total, "none", "$", scale, scale === "none" ? 2 : 1);
}

export function DashboardCompareSpecSection({
  agg,
  updateAgg,
  savedMetrics,
  previewRows,
  widgetType,
  kpiUserTimeScope,
}: DashboardCompareSpecSectionProps) {
  const compare = effectiveCompare(agg);
  const ui = defaultCompareUi(agg.dashboardCompareUi);
  const dims = dimensionsListFromAgg(agg);
  const timeColumnDefault = pickDateGroupBySourceField(agg) || agg.dateDimension?.trim() || dims[0] || "";
  const granularity = (agg.dateGroupByGranularity ?? "month") as DateGranularity;
  const primaryMetricAlias = (agg.metrics ?? []).map((m) => String(m.alias || "").trim()).filter(Boolean)[0] ?? "";

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
  const showKpiTemporalSeriesHint =
    widgetType === "kpi" && compareNeedsTimeGroupedRows(compare) && !agg.dateGroupByGranularity;
  const showKpiTotalVsPeriodHint =
    widgetType === "kpi" && compareNeedsTimeGroupedRows(compare) && compare.kind !== "none";

  const compareBadge = compareKindBadgeLabel(compare);
  const previewMainTotal =
    widgetType === "kpi" ? previewMainKpiTotal(previewRows, primaryMetricAlias, kpiUserTimeScope) : null;
  const previewCompareLine = previewCompareLineText(previewRows, compare, primaryMetricAlias);
  const hasPreview = !!(previewMainTotal || previewCompareLine);

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
      const ensured = ensureDashboardCompareUi(
        { ...agg, compare: next },
        { widgetType, chartType: widgetType }
      );
      patch.dashboardCompareUi = ensured ?? { ...ui, enabled: true };
    }
    updateAgg(patch);
  };

  const applySavedCompare = (id: string) => {
    const saved = savedMetrics.find((s) => s.id === id);
    if (!saved?.aggregationConfig) return;
    const cfg = saved.aggregationConfig as DashboardCompareAggSlice;
    const ensuredUi = ensureDashboardCompareUi(cfg, { widgetType, chartType: widgetType });
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
      dashboardCompareUi: ensuredUi ?? defaultCompareUi({ enabled: true }),
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)]/40 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Comparación</Label>
        {compareBadge && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--studio-accent)]/15 text-[var(--studio-accent)] font-medium">
            {compareBadge}
          </span>
        )}
      </div>

      <p className="text-[10px] text-[var(--studio-fg-muted)] leading-snug">
        Configurá aquí el tipo de comparación y cómo se muestra. Los cambios recargan los datos automáticamente; el
        valor principal del KPI no cambia al activar comparación (solo al cambiar filtros).
      </p>

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
        </div>
      )}

      <div className="space-y-3">
        <Label className="text-[11px] font-medium text-[var(--studio-fg-muted)]">1. Tipo y parámetros</Label>
        <CompareSpecFields
          variant="studio"
          compare={compare}
          setCompare={setCompare}
          timeColumnDefault={timeColumnDefault}
          timeColumnOptions={timeColumnDefault ? [timeColumnDefault, ...dims.filter((d) => d !== timeColumnDefault)] : dims}
          granularity={granularity}
          dims={dims}
          compareColumnCandidates={compareColumnCandidates}
          fixedValue={String(agg.transformCompareFixedValue ?? "")}
          onFixedValueChange={(v) => updateAgg({ transformCompareFixedValue: v })}
          showKpiTemporalSeriesHint={showKpiTemporalSeriesHint}
          showKpiTotalVsPeriodHint={showKpiTotalVsPeriodHint}
        />
      </div>

      {hasPreview && compare.kind !== "none" && (
        <div className="rounded-md border border-[var(--studio-border)] bg-[var(--studio-surface)]/60 px-2.5 py-2 space-y-1">
          <Label className="text-[10px] font-medium text-[var(--studio-fg-muted)]">Vista previa (datos actuales)</Label>
          {previewMainTotal && (
            <p className="text-[11px] text-[var(--studio-fg)]">
              <span className="text-[var(--studio-fg-muted)]">Valor principal (total del rango):</span>{" "}
              <span className="font-semibold tabular-nums">{previewMainTotal}</span>
              {primaryMetricAlias ? (
                <span className="text-[var(--studio-fg-muted)]"> · {primaryMetricAlias}</span>
              ) : null}
            </p>
          )}
          {previewCompareLine && (
            <p className="text-[11px] text-[var(--studio-accent)]">
              <span className="text-[var(--studio-fg-muted)]">Comparación (último período):</span> {previewCompareLine}
            </p>
          )}
          {!previewCompareLine && (
            <p className="text-[10px] text-[var(--studio-fg-muted)]">
              La comparación se mostrará cuando haya datos con columnas de referencia calculadas.
            </p>
          )}
        </div>
      )}

      {compare.kind !== "none" && (
        <div className="space-y-3 border-t border-[var(--studio-border)] pt-3">
          <Label className="text-[11px] font-medium text-[var(--studio-fg-muted)]">2. Presentación en el dashboard</Label>
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
    </div>
  );
}
