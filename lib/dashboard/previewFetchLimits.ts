import type { AggregateRequestAgg } from "@/lib/dashboard/buildAggregateRequestPayload";

/** Límites para vista previa / editor / viewer (no ETL preview ilimitado). */
export const PREVIEW_FETCH_LIMITS = {
  MAP: 500,
  RAW_DEFAULT: 500,
  CATEGORICAL: 500,
  TEMPORAL: 4000,
  TABLE: 1000,
  SCATTER: 1500,
  KPI: 50,
  RANKING_BUFFER: 25,
  SAFETY_CAP: 5000,
} as const;

export type PreviewAggregateFetchPlan = {
  unlimited: boolean;
  limit?: number;
  orderBy?: { field: string; direction: "ASC" | "DESC" };
};

function pinnedRankingExtra(agg: AggregateRequestAgg): number {
  const pinned = agg.chartRankingPinnedXValues;
  return Array.isArray(pinned) ? pinned.length : 0;
}

function resolveRankingOrderBy(
  agg: AggregateRequestAgg,
  metrics: Array<{ alias?: string }> | undefined
): { field: string; direction: "ASC" | "DESC" } | undefined {
  const direction: "ASC" | "DESC" = agg.chartRankingDirection === "asc" ? "ASC" : "DESC";
  const explicit = String(agg.chartRankingMetric ?? "").trim();
  if (explicit) return { field: explicit, direction };
  const firstAlias = String(metrics?.[0]?.alias ?? "").trim();
  if (firstAlias) return { field: firstAlias, direction };
  return undefined;
}

/**
 * Decide cuántas filas pedir al aggregate-data en preview/editor/viewer.
 * Evita `unlimited: true` salvo que se pida explícitamente (p. ej. ETL).
 */
export function resolvePreviewAggregateFetchPlan(params: {
  chartType: string;
  agg: AggregateRequestAgg;
  hasDateGroupBy: boolean;
  metrics?: Array<{ alias?: string }>;
  forceUnlimited?: boolean;
}): PreviewAggregateFetchPlan {
  const { chartType, agg, hasDateGroupBy, metrics, forceUnlimited = false } = params;
  const type = chartType.trim().toLowerCase();

  if (forceUnlimited) {
    return { unlimited: true };
  }

  if (type === "map") {
    return { limit: PREVIEW_FETCH_LIMITS.MAP };
  }

  if (type === "kpi" && !hasDateGroupBy) {
    return { limit: PREVIEW_FETCH_LIMITS.KPI };
  }

  if (type === "table") {
    return { limit: PREVIEW_FETCH_LIMITS.TABLE };
  }

  const rankingActive = !!agg.chartRankingEnabled && (agg.chartRankingTop ?? 0) > 0;
  if (rankingActive && !hasDateGroupBy) {
    const top = Math.max(1, agg.chartRankingTop ?? 5);
    const limit = Math.min(
      PREVIEW_FETCH_LIMITS.SAFETY_CAP,
      top + pinnedRankingExtra(agg) + PREVIEW_FETCH_LIMITS.RANKING_BUFFER
    );
    const orderBy = resolveRankingOrderBy(agg, metrics);
    return orderBy ? { unlimited: false, limit, orderBy } : { unlimited: false, limit };
  }

  if (hasDateGroupBy) {
    return { limit: PREVIEW_FETCH_LIMITS.TEMPORAL };
  }

  if (type === "scatter") {
    return { limit: PREVIEW_FETCH_LIMITS.SCATTER };
  }

  const hasGrouping =
    (Array.isArray(agg.dimensions) && agg.dimensions.length > 0) ||
    !!String(agg.dimension ?? "").trim() ||
    !!String(agg.dimension2 ?? "").trim();

  if (hasGrouping) {
    return { limit: PREVIEW_FETCH_LIMITS.CATEGORICAL };
  }

  if (agg.limit != null && agg.limit > 0) {
    return { limit: Math.min(PREVIEW_FETCH_LIMITS.SAFETY_CAP, agg.limit) };
  }

  return { limit: PREVIEW_FETCH_LIMITS.CATEGORICAL };
}
