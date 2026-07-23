import { describe, expect, it } from "vitest";
import { buildChartConfig } from "@/lib/dashboard/buildChartConfig";

describe("chartQuickCalc recursion", () => {
  it("percent_total no tira el stack", () => {
    const rows = [
      { cat: "A", m1: 25 },
      { cat: "B", m1: 75 },
    ];
    const widget = {
      type: "bar",
      aggregationConfig: {
        enabled: true,
        chartType: "bar",
        chartXAxis: "cat",
        chartYAxes: ["m1"],
        chartQuickCalc: "percent_total",
        metrics: [{ field: "m1", func: "SUM", alias: "m1" }],
      },
    };
    expect(() => buildChartConfig(rows, widget as never, "#0ea5e9")).not.toThrow();
  });

  it("percent_dimension no tira el stack", () => {
    const rows = [
      { cat: "A", grp: "g1", m1: 10 },
      { cat: "B", grp: "g1", m1: 30 },
      { cat: "C", grp: "g2", m1: 60 },
    ];
    const widget = {
      type: "bar",
      chartPercentGroupField: "grp",
      aggregationConfig: {
        enabled: true,
        chartType: "bar",
        chartXAxis: "cat",
        chartYAxes: ["m1"],
        chartQuickCalc: "percent_dimension",
        chartPercentGroupField: "grp",
        metrics: [{ field: "m1", func: "SUM", alias: "m1" }],
      },
    };
    expect(() => buildChartConfig(rows, widget as never, "#0ea5e9")).not.toThrow();
  });
});
