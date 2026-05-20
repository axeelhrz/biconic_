import { describe, expect, it } from "vitest";
import { expandAggregationFiltersForTemporalCompare, shiftCalendarYearMonth } from "@/lib/dashboard/expandAggregationFiltersForCompare";

describe("shiftCalendarYearMonth", () => {
  it("retrocede un mes cruzando año", () => {
    expect(shiftCalendarYearMonth(2026, 3, -1)).toEqual({ year: 2026, month1: 2 });
    expect(shiftCalendarYearMonth(2026, 1, -1)).toEqual({ year: 2025, month1: 12 });
  });
});

describe("expandAggregationFiltersForTemporalCompare", () => {
  it("añade el mes anterior para MONTH + calendar_prev_month", () => {
    const spec = {
      kind: "temporal" as const,
      mode: "calendar_prev_month" as const,
      timeColumn: "fecha_venta",
      granularity: "month" as const,
    };
    const out = expandAggregationFiltersForTemporalCompare(
      [{ field: "fecha_venta", operator: "MONTH", value: "2026-03" }],
      { compareField: "fecha_venta", compareSpec: spec }
    );
    expect(out[0]?.operator).toBe("MONTH");
    const v = out[0]?.value;
    expect(Array.isArray(v)).toBe(true);
    expect((v as string[]).sort()).toEqual(["2026-02", "2026-03"].sort());
  });

  it("añade el mismo mes del año anterior para YEAR_MONTH + same_period_prior_year", () => {
    const spec = {
      kind: "temporal" as const,
      mode: "same_period_prior_year" as const,
      timeColumn: "f",
      granularity: "month" as const,
    };
    const out = expandAggregationFiltersForTemporalCompare(
      [{ field: "f", operator: "YEAR_MONTH", value: ["2026-03"] }],
      { compareField: "f", compareSpec: spec }
    );
    const v = out[0]?.value as string[];
    expect(v.sort()).toEqual(["2025-03", "2026-03"].sort());
  });

  it("YEAR=2026 + same_period_prior_year incluye 2025", () => {
    const spec = {
      kind: "temporal" as const,
      mode: "same_period_prior_year" as const,
      timeColumn: "fecha",
      granularity: "month" as const,
    };
    const out = expandAggregationFiltersForTemporalCompare(
      [{ field: "fecha", operator: "YEAR", value: 2026 }],
      { compareField: "fecha", compareSpec: spec }
    );
    const v = out[0]?.value;
    expect(Array.isArray(v) ? [...(v as number[])].sort((a, b) => a - b) : [v]).toEqual([2025, 2026]);
  });

  it("no modifica con periodSource fixed", () => {
    const spec = {
      kind: "temporal" as const,
      mode: "calendar_prev_month" as const,
      timeColumn: "f",
      granularity: "month" as const,
    };
    const orig = [{ field: "f", operator: "MONTH", value: "2026-03" }];
    const out = expandAggregationFiltersForTemporalCompare(orig, {
      compareField: "f",
      compareSpec: spec,
      periodSource: "fixed",
    });
    expect(out).toEqual(orig);
  });
});
