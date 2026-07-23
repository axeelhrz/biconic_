import { describe, expect, it } from "vitest";
import {
  findDuplicateNameWithinList,
  findDuplicateSavedMetricName,
  normalizeSavedMetricName,
} from "@/lib/dashboard/savedMetricNames";

describe("savedMetricNames", () => {
  it("normalizes names for comparison", () => {
    expect(normalizeSavedMetricName("  Reach  Total ")).toBe("reach total");
    expect(normalizeSavedMetricName("REACH")).toBe("reach");
  });

  it("finds duplicate by name excluding the metric being edited", () => {
    const list = [
      { id: "a", name: "Reach" },
      { id: "b", name: "Ventas" },
    ];
    expect(findDuplicateSavedMetricName(list, "reach", "a")).toBeNull();
    expect(findDuplicateSavedMetricName(list, "Reach", null)?.id).toBe("a");
    expect(findDuplicateSavedMetricName(list, "ventas", "a")?.id).toBe("b");
  });

  it("detects duplicates within the same list", () => {
    expect(findDuplicateNameWithinList([{ id: "1", name: "A" }, { id: "2", name: "a" }])).toBe("a");
    expect(findDuplicateNameWithinList([{ id: "1", name: "A" }, { id: "2", name: "B" }])).toBeNull();
  });
});
