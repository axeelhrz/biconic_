import { describe, expect, it } from "vitest";
import type { CompareSpec } from "@/lib/dashboard/compareSpec";
import { getCompareColumnKeys, readComparePresentation, normalizeComparePlacements, placementEnabled } from "@/lib/dashboard/compareDisplayKeys";

describe("getCompareColumnKeys", () => {
  const row = {
    ventas: 100,
    ventas_prev: 80,
    ventas_delta: 20,
    ventas_delta_pct: 25,
  };

  it("temporal: prev/delta/delta_pct", () => {
    const spec: CompareSpec = {
      kind: "temporal",
      mode: "prev_bucket",
      timeColumn: "mes",
      granularity: "month",
    };
    const keys = getCompareColumnKeys(spec, "ventas", row);
    expect(keys.resolvedMetricKey).toBe("ventas");
    expect(keys.referenceSeriesKey).toBe("ventas_prev");
    expect(keys.tableExtraKeys).toContain("ventas_delta_pct");
  });

  it("fixed: vs_fijo / var_pct_fijo", () => {
    const r = { m: 50, m_vs_fijo: 10, m_var_pct_fijo: 25 };
    const keys = getCompareColumnKeys({ kind: "fixed", value: 40 }, "m", r);
    expect(keys.deltaKey).toBe("m_vs_fijo");
    expect(keys.deltaPctKey).toBe("m_var_pct_fijo");
  });

  it("readComparePresentation temporal", () => {
    const spec: CompareSpec = {
      kind: "temporal",
      mode: "calendar_prev_month",
      timeColumn: "mes",
      granularity: "month",
    };
    const v = readComparePresentation(spec, "ventas", row);
    expect(v.current).toBe(100);
    expect(v.reference).toBe(80);
    expect(v.delta).toBe(20);
    expect(v.deltaPct).toBe(25);
  });
});

describe("normalizeComparePlacements", () => {
  it("defaults kpi_below", () => {
    expect(normalizeComparePlacements(undefined)).toEqual(["kpi_below"]);
  });
  it("wraps single", () => {
    expect(normalizeComparePlacements("tooltip")).toEqual(["tooltip"]);
  });
});

describe("placementEnabled", () => {
  it("false when disabled", () => {
    expect(placementEnabled({ enabled: false, placement: "tooltip" }, "tooltip")).toBe(false);
  });
  it("true when enabled and listed", () => {
    expect(
      placementEnabled({ enabled: true, placement: ["kpi_below", "tooltip"] }, "tooltip")
    ).toBe(true);
  });
});
