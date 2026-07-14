import { describe, expect, it } from "vitest";
import {
  isAttributeMetric,
  metricChartNumericValue,
  resolveDashboardKpiDisplayValue,
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
});
