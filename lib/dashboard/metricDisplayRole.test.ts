import { describe, expect, it } from "vitest";
import {
  isAttributeMetric,
  metricChartNumericValue,
  resolveArgmaxDimensionLabel,
  resolveDashboardKpiDisplayValue,
  wantsAttributeDimensionDisplay,
} from "@/lib/dashboard/metricDisplayRole";

describe("metricDisplayRole", () => {
  it("detects attribute metrics", () => {
    expect(isAttributeMetric({ func: "ATTRIBUTE", field: "provincia" })).toBe(true);
    expect(isAttributeMetric({ func: "SUM", displayRole: "attribute", field: "x" })).toBe(true);
    expect(isAttributeMetric({ func: "SUM", field: "x" })).toBe(false);
  });

  it("uses placeholder height for attribute chart values", () => {
    expect(metricChartNumericValue({ nombre: "Buenos Aires" }, "nombre", true)).toBe(1);
    expect(metricChartNumericValue({ nombre: "" }, "nombre", true)).toBe(0);
    expect(metricChartNumericValue({ ventas: 10 }, "ventas", false)).toBe(10);
  });

  it("resolves KPI attribute text instead of sum", () => {
    const rows = [{ provincia: "Córdoba" }, { provincia: "Mendoza" }];
    expect(resolveDashboardKpiDisplayValue(rows, "provincia", true)).toBe("Córdoba");
    expect(resolveDashboardKpiDisplayValue(rows, "ventas", false)).toBe(0);
  });

  it("resolves argmax dimension label from metric values", () => {
    const rows = [
      { medio: "Facebook", reach: 100 },
      { medio: "Instagram", reach: 500 },
      { medio: "Twitter", reach: 200 },
    ];
    expect(resolveArgmaxDimensionLabel(rows, "reach", "medio", "max")).toBe("Instagram");
    expect(resolveArgmaxDimensionLabel(rows, "reach", "medio", "min")).toBe("Facebook");
    expect(resolveArgmaxDimensionLabel([], "reach", "medio")).toBe("—");
  });

  it("detects wantsAttributeDimensionDisplay", () => {
    expect(wantsAttributeDimensionDisplay({ resultDisplayMode: "dimension", resultAttributeDimension: "medio" })).toBe(true);
    expect(wantsAttributeDimensionDisplay({ resultDisplayMode: "number", resultAttributeDimension: "medio" })).toBe(false);
    expect(wantsAttributeDimensionDisplay({ resultDisplayMode: "dimension", resultAttributeDimension: "" })).toBe(false);
  });
});
