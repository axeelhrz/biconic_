import { describe, it, expect } from "vitest";
import { createChartPercentDenominatorResolver } from "@/lib/dashboard/chartPercentEngine";
import type { BuildChartConfigWidget } from "@/lib/dashboard/buildChartConfig";
import type { ChartConfig } from "@/lib/dashboard/buildChartConfig";

function widgetBarTopN(): BuildChartConfigWidget {
  return {
    type: "bar",
    aggregationConfig: {
      enabled: true,
      dimension: "cat",
      metrics: [{ field: "v", func: "SUM", alias: "sum_v" }],
      chartType: "bar",
      chartXAxis: "cat",
      chartYAxes: ["sum_v"],
      chartRankingEnabled: true,
      chartRankingTop: 2,
      chartRankingMetric: "sum_v",
      chartRankingDirection: "desc",
    },
  };
}

describe("createChartPercentDenominatorResolver", () => {
  it("analysis_total usa la suma de todas las filas, no solo el Top N visible", () => {
    const fullRows = [
      { cat: "A", sum_v: 100 },
      { cat: "B", sum_v: 50 },
      { cat: "C", sum_v: 10 },
    ];
    const chartConfig: ChartConfig = {
      labels: ["A", "B"],
      xRawCategoryKeys: ["A", "B"],
      datasets: [{ label: "sum_v", data: [100, 50] }],
    };
    const w = widgetBarTopN();
    const r = createChartPercentDenominatorResolver({
      basisRaw: "analysis_total",
      fullRows,
      widget: w,
      chartConfig,
      accentColor: "",
    });
    expect(r(0, 0)).toBe(160);
    expect(r(1, 0)).toBe(160);
  });

  it("chart_visible_total suma solo lo mostrado en el gráfico", () => {
    const fullRows = [
      { cat: "A", sum_v: 100 },
      { cat: "B", sum_v: 50 },
      { cat: "C", sum_v: 10 },
    ];
    const chartConfig: ChartConfig = {
      labels: ["A", "B"],
      xRawCategoryKeys: ["A", "B"],
      datasets: [{ label: "sum_v", data: [100, 50] }],
    };
    const r = createChartPercentDenominatorResolver({
      basisRaw: "chart_visible_total",
      fullRows,
      widget: widgetBarTopN(),
      chartConfig,
      accentColor: "",
    });
    expect(r(0, 0)).toBe(150);
  });

  it("per_denominator_metric con columna B y mismo eje X", () => {
    const fullRows = [
      { cat: "A", m1: 10, m2: 100 },
      { cat: "B", m1: 20, m2: 200 },
    ];
    const chartConfig: ChartConfig = {
      labels: ["A", "B"],
      xRawCategoryKeys: ["A", "B"],
      datasets: [{ label: "m1", data: [10, 20] }],
    };
    const widget: BuildChartConfigWidget = {
      type: "bar",
      aggregationConfig: {
        enabled: true,
        dimension: "cat",
        metrics: [
          { field: "x", func: "SUM", alias: "m1" },
          { field: "y", func: "SUM", alias: "m2" },
        ],
        chartType: "bar",
        chartXAxis: "cat",
        chartYAxes: ["m1"],
      },
    };
    const r = createChartPercentDenominatorResolver({
      basisRaw: "per_denominator_metric",
      fullRows,
      widget: {
        ...widget,
        chartPercentDenominatorMetric: "m2",
        chartPercentDenominatorScope: "analysis",
      },
      chartConfig,
      accentColor: "",
    });
    expect(r(0, 0)).toBe(100);
    expect(r(1, 0)).toBe(200);
  });

  it("per_dimension_group suma la métrica dentro del grupo", () => {
    const fullRows = [
      { cat: "x1", region: "N", val: 30 },
      { cat: "x2", region: "N", val: 70 },
      { cat: "x3", region: "S", val: 100 },
    ];
    const chartConfig: ChartConfig = {
      labels: ["x1", "x2"],
      xRawCategoryKeys: ["x1", "x2"],
      datasets: [{ label: "val", data: [30, 70] }],
    };
    const widget: BuildChartConfigWidget = {
      type: "bar",
      aggregationConfig: {
        enabled: true,
        dimension: "cat",
        metrics: [{ field: "v", func: "SUM", alias: "val" }],
        chartType: "bar",
        chartXAxis: "cat",
        chartYAxes: ["val"],
        chartRankingEnabled: true,
        chartRankingTop: 10,
        chartRankingMetric: "val",
      },
    };
    const r = createChartPercentDenominatorResolver({
      basisRaw: "per_dimension_group",
      fullRows,
      widget: { ...widget, chartPercentGroupField: "region" },
      chartConfig,
      accentColor: "",
    });
    expect(r(0, 0)).toBe(100);
    expect(r(1, 0)).toBe(100);
  });
});
