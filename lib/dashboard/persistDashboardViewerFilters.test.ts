import { describe, expect, it } from "vitest";
import {
  collectDashboardFilterIds,
  mergeDimensionDefaultsFromPersistence,
  mergeFilterValuesFromPersistence,
} from "@/lib/dashboard/persistDashboardViewerFilters";

describe("persistDashboardViewerFilters", () => {
  it("collects global and widget filter ids", () => {
    const ids = collectDashboardFilterIds(
      [{ id: "gf1", field: "region" } as never],
      [
        { id: "fw1", type: "filter" },
        { id: "kpi1", type: "kpi" },
      ]
    );
    expect(ids.has("gf1")).toBe(true);
    expect(ids.has("fw1")).toBe(true);
    expect(ids.has("kpi1")).toBe(false);
  });

  it("merges persisted filter values over layout defaults", () => {
    const merged = mergeFilterValuesFromPersistence(
      { gf1: "default" },
      { gf1: "saved", gf2: "other" },
      new Set(["gf1"])
    );
    expect(merged).toEqual({ gf1: "saved" });
  });

  it("merges dimension default values per widget", () => {
    const merged = mergeDimensionDefaultsFromPersistence(
      { w1: { d1: "seed" } },
      { w1: { d1: "user", d2: "x" } },
      [
        {
          id: "w1",
          aggregationConfig: { dimensionDefaultFilters: [{ id: "d1" }] },
        },
      ]
    );
    expect(merged).toEqual({ w1: { d1: "user" } });
  });
});
