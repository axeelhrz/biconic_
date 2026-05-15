import { describe, expect, it } from "vitest";
import { pickDateGroupBySourceField, pickSemanticDateAxisForGlobalFilters } from "@/lib/dashboard/dateGroupBySourceField";

describe("pickSemanticDateAxisForGlobalFilters", () => {
  it("usa dateDimension cuando no hay dimensiones visibles (KPI)", () => {
    expect(
      pickSemanticDateAxisForGlobalFilters({
        dimensions: [],
        dateDimension: "fecha_compra",
        dateGroupByGranularity: "month",
      })
    ).toBe("fecha_compra");
  });

  it("coincide con pickDateGroupBySourceField cuando la fecha está en dimensions", () => {
    const agg = {
      dimensions: ["fecha_compra", "rubro"],
      dateDimension: "fecha_compra",
      dateGroupByGranularity: "month",
    };
    expect(pickSemanticDateAxisForGlobalFilters(agg)).toBe(pickDateGroupBySourceField(agg));
  });
});
