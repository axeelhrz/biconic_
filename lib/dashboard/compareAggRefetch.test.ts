import { describe, expect, it } from "vitest";
import {
  shouldRefetchWidgetOnAggDataPatch,
  shouldRefetchWidgetOnComparePatch,
  shouldRefetchWidgetOnAggregationPatch,
} from "@/lib/dashboard/compareAggRefetch";

describe("shouldRefetchWidgetOnAggDataPatch", () => {
  it("refetch al cambiar filters", () => {
    expect(shouldRefetchWidgetOnAggDataPatch({ filters: [{ id: "f1", field: "x", operator: "=", value: 1 }] })).toBe(
      true
    );
  });

  it("refetch al cambiar dimensionDefaultFilters", () => {
    expect(
      shouldRefetchWidgetOnAggDataPatch({
        dimensionDefaultFilters: [{ id: "d1", field: "pais", operator: "=", defaultValue: "AR" }],
      })
    ).toBe(true);
  });

  it("refetch al cambiar excludeGlobalFilters", () => {
    expect(shouldRefetchWidgetOnAggDataPatch({ excludeGlobalFilters: true })).toBe(true);
  });

  it("no refetch solo por chartType", () => {
    expect(shouldRefetchWidgetOnAggDataPatch({ chartType: "line" })).toBe(false);
  });
});

describe("shouldRefetchWidgetOnAggregationPatch", () => {
  it("combina compare y data patches", () => {
    expect(shouldRefetchWidgetOnAggregationPatch({ compare: { kind: "temporal" } })).toBe(true);
    expect(shouldRefetchWidgetOnAggregationPatch({ filters: [] })).toBe(true);
    expect(shouldRefetchWidgetOnAggregationPatch({ chartGridXDisplay: true })).toBe(false);
  });
});

describe("shouldRefetchWidgetOnComparePatch", () => {
  it("compare temporal dispara refetch", () => {
    expect(
      shouldRefetchWidgetOnComparePatch({
        compare: { kind: "temporal", mode: "prev_bucket", timeColumn: "fecha", granularity: "month" },
      })
    ).toBe(true);
  });
});
