import { describe, expect, it } from "vitest";
import { resolveEffectiveDateGroupByForFetch } from "@/lib/dashboard/aggregateCompareRequest";

describe("resolveEffectiveDateGroupByForFetch", () => {
  it("infiere dateGroupBy para KPI con comparación temporal sin dimensión visible", () => {
    const compareSpec = {
      kind: "temporal" as const,
      mode: "calendar_prev_month" as const,
      timeColumn: "fecha_venta",
      granularity: "month" as const,
    };
    const dg = resolveEffectiveDateGroupByForFetch({
      effectiveChartType: "kpi",
      agg: {
        dimensions: [],
        dateGroupByGranularity: "month",
        dateDimension: "fecha_venta",
      },
      compareSpec,
      mapPhysicalField: (f) => f,
    });
    expect(dg.hasVisibleDateGroupBy).toBe(false);
    expect(dg.hasDateGroupByEffective).toBe(true);
    expect(dg.dateGroupByField).toBe("fecha_venta");
    expect(dg.dateGroupByGranularity).toBe("month");
    expect(dg.defaultTemporalOrderBy).toEqual({ field: "fecha_venta", direction: "ASC" });
  });

  it("con inferInternalSeriesWithoutVisibleTimeDimension infiere aunque el chart no sea KPI", () => {
    const compareSpec = {
      kind: "temporal" as const,
      mode: "prev_bucket" as const,
      timeColumn: "f",
      granularity: "month" as const,
    };
    const dg = resolveEffectiveDateGroupByForFetch({
      effectiveChartType: "bar",
      agg: {
        dimensions: [],
        dateGroupByGranularity: "month",
      },
      compareSpec,
      mapPhysicalField: (f) => f,
      inferInternalSeriesWithoutVisibleTimeDimension: true,
    });
    expect(dg.dateGroupByField).toBe("f");
  });
});
