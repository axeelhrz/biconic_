import { describe, expect, it } from "vitest";
import { buildChartConfig, getProcessedRowsForChart } from "@/lib/dashboard/buildChartConfig";

describe("orderBy en buildChartConfig", () => {
  const rows = [
    { cat: "A", total: 10 },
    { cat: "B", total: 30 },
    { cat: "C", total: 20 },
  ];

  it("respeta orderBy por métrica aunque haya chartAxisOrder date", () => {
    const widget = {
      type: "bar",
      aggregationConfig: {
        enabled: true,
        chartType: "bar",
        chartXAxis: "cat",
        chartYAxes: ["total"],
        dateDimension: "cat",
        chartAxisOrder: "date_asc",
        orderBy: { field: "total", direction: "DESC" as const },
      },
    };
    const cfg = buildChartConfig(rows, widget);
    expect(cfg).toBeDefined();
    expect(cfg!.labels).toEqual(["B", "C", "A"]);
  });

  it("getProcessedRowsForChart aplica el mismo orderBy", () => {
    const widget = {
      type: "table",
      aggregationConfig: {
        enabled: true,
        chartType: "table",
        chartXAxis: "cat",
        chartYAxes: ["total"],
        orderBy: { field: "total", direction: "ASC" as const },
      },
    };
    const processed = getProcessedRowsForChart(rows, widget);
    expect(processed.map((r) => r.cat)).toEqual(["A", "C", "B"]);
  });
});
