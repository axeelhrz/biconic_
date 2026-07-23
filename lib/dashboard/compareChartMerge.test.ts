import { describe, expect, it } from "vitest";
import { appendCompareLineDatasetsIfConfigured } from "@/lib/dashboard/compareChartMerge";
import type { BuildChartConfigWidget, ChartConfig } from "@/lib/dashboard/buildChartConfig";

function baseWidget(over: Partial<BuildChartConfigWidget["aggregationConfig"]> = {}): BuildChartConfigWidget {
  return {
    type: "line",
    aggregationConfig: {
      enabled: true,
      chartType: "line",
      chartYAxes: ["ventas"],
      compare: { kind: "fixed", value: 100 },
      dashboardCompareUi: {
        enabled: true,
        placement: ["line_reference_series"],
      },
      ...over,
    },
  };
}

describe("appendCompareLineDatasetsIfConfigured", () => {
  const rows = [
    { mes: "2024-01", ventas: 80, ventas_fijo: 100 },
    { mes: "2024-02", ventas: 90, ventas_fijo: 100 },
  ];
  const datasets: ChartConfig["datasets"] = [
    { label: "Ventas", data: [80, 90], borderColor: "#0ea5e9" },
  ];

  it("agrega serie Objetivo con borde discontinuo", () => {
    const out = appendCompareLineDatasetsIfConfigured("line", rows, baseWidget(), ["ventas"], datasets, 2);
    expect(out).toHaveLength(2);
    expect(out[1]?.label).toMatch(/Objetivo/i);
    expect(out[1]?.data).toEqual([100, 100]);
    expect(out[1]?.borderDash).toEqual([6, 4]);
    expect(out[1]?.type).toBe("line");
  });

  it("no agrega si placement no incluye serie comparativa", () => {
    const out = appendCompareLineDatasetsIfConfigured(
      "line",
      rows,
      baseWidget({ dashboardCompareUi: { enabled: true, placement: ["tooltip"] } }),
      ["ventas"],
      datasets,
      2
    );
    expect(out).toHaveLength(1);
  });

  it("asigna yAxisID de la métrica con doble eje", () => {
    const out = appendCompareLineDatasetsIfConfigured(
      "line",
      [
        { mes: "a", ventas: 1, unidades: 2, ventas_fijo: 10, unidades_fijo: 20 },
        { mes: "b", ventas: 3, unidades: 4, ventas_fijo: 10, unidades_fijo: 20 },
      ],
      {
        type: "line",
        aggregationConfig: {
          enabled: true,
          chartType: "line",
          chartYAxes: ["ventas", "unidades"],
          chartDualAxis: true,
          chartMetricAxis: { ventas: "left", unidades: "right" },
          compare: { kind: "fixed", value: 10 },
          dashboardCompareUi: { enabled: true, placement: ["line_reference_series"] },
        },
      },
      ["ventas", "unidades"],
      [
        { label: "Ventas", data: [1, 3], yAxisID: "y" },
        { label: "Unidades", data: [2, 4], yAxisID: "y1" },
      ],
      2
    );
    const compareVentas = out.find((d) => String(d.label).includes("ventas") && d.borderDash);
    const compareUnidades = out.find((d) => String(d.label).includes("unidades") && d.borderDash);
    expect(compareVentas?.yAxisID).toBe("y");
    expect(compareUnidades?.yAxisID).toBe("y1");
  });
});
