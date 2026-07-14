import { describe, expect, it } from "vitest";
import { PREVIEW_FETCH_LIMITS, resolvePreviewAggregateFetchPlan } from "./previewFetchLimits";

describe("resolvePreviewAggregateFetchPlan", () => {
  it("limita mapas a 500 filas", () => {
    const plan = resolvePreviewAggregateFetchPlan({
      chartType: "map",
      agg: { dimension: "ciudad" },
      hasDateGroupBy: false,
    });
    expect(plan.unlimited).toBeFalsy();
    expect(plan.limit).toBe(PREVIEW_FETCH_LIMITS.MAP);
  });

  it("usa ranking con orderBy en lugar de unlimited", () => {
    const plan = resolvePreviewAggregateFetchPlan({
      chartType: "bar",
      agg: {
        chartRankingEnabled: true,
        chartRankingTop: 10,
        chartRankingMetric: "total",
        chartRankingDirection: "desc",
        dimension: "categoria",
      },
      hasDateGroupBy: false,
      metrics: [{ alias: "total" }],
    });
    expect(plan.unlimited).toBeFalsy();
    expect(plan.limit).toBe(10 + PREVIEW_FETCH_LIMITS.RANKING_BUFFER);
    expect(plan.orderBy).toEqual({ field: "total", direction: "DESC" });
  });

  it("permite series temporales con límite alto", () => {
    const plan = resolvePreviewAggregateFetchPlan({
      chartType: "line",
      agg: { dateDimension: "fecha" },
      hasDateGroupBy: true,
    });
    expect(plan.limit).toBe(PREVIEW_FETCH_LIMITS.TEMPORAL);
  });

  it("respeta forceUnlimited explícito", () => {
    const plan = resolvePreviewAggregateFetchPlan({
      chartType: "bar",
      agg: { dimension: "x" },
      hasDateGroupBy: false,
      forceUnlimited: true,
    });
    expect(plan.unlimited).toBe(true);
  });
});
