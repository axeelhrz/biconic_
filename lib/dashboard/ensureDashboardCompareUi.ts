import type { DashboardComparePlacement, DashboardCompareUi } from "@/lib/dashboard/compareDisplayKeys";
import { legacyCompareInputFromWidgetAgg } from "@/lib/dashboard/compareDisplayKeys";
import { normalizeAggregationCompare } from "@/lib/dashboard/compareSpec";

export type AggForDashboardCompareUi = {
  compare?: unknown;
  comparePeriod?: "previous_year" | "previous_month";
  compareFixedValue?: number;
  transformCompare?: string;
  transformCompareFixedValue?: string;
  transformShowDelta?: boolean;
  transformShowDeltaPct?: boolean;
  dashboardCompareUi?: DashboardCompareUi;
  dateDimension?: string;
};

export type EnsureDashboardCompareUiOptions = {
  widgetType?: string;
  chartType?: string;
};

function effectiveChartType(widgetType?: string, chartType?: string): string {
  const t = (chartType || widgetType || "").trim().toLowerCase();
  return t || "bar";
}

/** Placements por defecto según tipo de visualización. */
export function defaultComparePlacementsForWidgetType(widgetType?: string, chartType?: string): DashboardComparePlacement[] {
  const t = effectiveChartType(widgetType, chartType);
  if (t === "kpi") return ["kpi_below"];
  if (t === "table") return ["table_extra_columns"];
  if (t === "line" || t === "area") return ["line_reference_series", "tooltip"];
  return ["tooltip", "detail_card"];
}

function hasActiveCompare(agg: AggForDashboardCompareUi | null | undefined): boolean {
  if (!agg) return false;
  const spec = normalizeAggregationCompare(legacyCompareInputFromWidgetAgg(agg));
  return spec.kind !== "none";
}

/**
 * Deriva `dashboardCompareUi` cuando hay comparación activa pero falta configuración de visualización.
 * Para persistencia (ETL, alta de widget, setCompare en panel).
 */
export function ensureDashboardCompareUi(
  agg: AggForDashboardCompareUi,
  options: EnsureDashboardCompareUiOptions = {}
): DashboardCompareUi | undefined {
  if (!hasActiveCompare(agg)) {
    const explicit = agg.dashboardCompareUi;
    if (explicit && explicit.enabled === false) return explicit;
    return undefined;
  }

  const prev = agg.dashboardCompareUi;
  const showDelta = agg.transformShowDelta !== false;
  const showDeltaPct = agg.transformShowDeltaPct !== false;
  const placement = prev?.placement ?? defaultComparePlacementsForWidgetType(options.widgetType, options.chartType);

  return {
    enabled: prev?.enabled !== false,
    label: prev?.label ?? "",
    showDelta: prev?.showDelta !== undefined ? prev.showDelta : showDelta,
    showDeltaPct: prev?.showDeltaPct !== undefined ? prev.showDeltaPct : showDeltaPct,
    placement,
    indicator: prev?.indicator ?? "both",
  };
}

/**
 * UI efectiva para render: respeta `enabled: false` explícito; si `enabled` es `undefined` y hay compare, infiere defaults.
 */
export function getEffectiveDashboardCompareUi(
  agg: AggForDashboardCompareUi | null | undefined,
  options: EnsureDashboardCompareUiOptions = {}
): DashboardCompareUi | undefined {
  if (!agg) return undefined;
  const explicit = agg.dashboardCompareUi;
  if (!hasActiveCompare(agg)) {
    return explicit?.enabled === false ? explicit : undefined;
  }
  if (explicit && explicit.enabled === false) return explicit;
  if (explicit?.enabled === true) return explicit;
  if (explicit && explicit.enabled === undefined) {
    return ensureDashboardCompareUi(agg, options);
  }
  if (!explicit) {
    return ensureDashboardCompareUi(agg, options);
  }
  return ensureDashboardCompareUi(agg, options);
}

/** `placementEnabled` usando UI efectiva (fallback ETL / legacy). */
export function effectivePlacementEnabled(
  agg: AggForDashboardCompareUi | null | undefined,
  placement: DashboardComparePlacement,
  options: EnsureDashboardCompareUiOptions = {}
): boolean {
  const ui = getEffectiveDashboardCompareUi(agg, options);
  if (!ui?.enabled) return false;
  const raw = ui.placement;
  const list = raw == null ? ["kpi_below"] : Array.isArray(raw) ? raw : [raw];
  return list.includes(placement);
}
