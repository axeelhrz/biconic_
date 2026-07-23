import { describe, expect, it } from "vitest";
import {
  chartTypeSupportsDualAxisUi,
  chartUsesDualAxis,
  resolveChartMetricYAxisId,
} from "@/lib/dashboard/chartMetricAxis";

describe("chartUsesDualAxis", () => {
  it("combo con 2+ métricas siempre usa doble eje", () => {
    expect(chartUsesDualAxis({}, "combo", 2)).toBe(true);
    expect(chartUsesDualAxis({ chartDualAxis: false }, "combo", 2)).toBe(true);
  });

  it("línea requiere flag chartDualAxis", () => {
    expect(chartUsesDualAxis({}, "line", 2)).toBe(false);
    expect(chartUsesDualAxis({ chartDualAxis: true }, "line", 2)).toBe(true);
  });

  it("una sola métrica no habilita doble eje", () => {
    expect(chartUsesDualAxis({ chartDualAxis: true }, "line", 1)).toBe(false);
    expect(chartUsesDualAxis({}, "combo", 1)).toBe(false);
  });
});

describe("resolveChartMetricYAxisId", () => {
  const agg = {
    chartDualAxis: true,
    chartMetricAxis: { ventas: "left" as const, unidades: "right" as const },
  };

  it("sin doble eje no asigna yAxisID", () => {
    expect(resolveChartMetricYAxisId("ventas", 0, {}, "line", 2)).toBeUndefined();
  });

  it("respeta left/right y defaults por índice", () => {
    expect(resolveChartMetricYAxisId("ventas", 0, agg, "line", 2)).toBe("y");
    expect(resolveChartMetricYAxisId("unidades", 1, agg, "line", 2)).toBe("y1");
    expect(resolveChartMetricYAxisId("otra", 0, { chartDualAxis: true }, "line", 2)).toBe("y");
    expect(resolveChartMetricYAxisId("otra", 1, { chartDualAxis: true }, "line", 2)).toBe("y1");
  });
});

describe("chartTypeSupportsDualAxisUi", () => {
  it("temporales y combo", () => {
    expect(chartTypeSupportsDualAxisUi("line")).toBe(true);
    expect(chartTypeSupportsDualAxisUi("combo")).toBe(true);
    expect(chartTypeSupportsDualAxisUi("pie")).toBe(false);
    expect(chartTypeSupportsDualAxisUi("kpi")).toBe(false);
  });
});
