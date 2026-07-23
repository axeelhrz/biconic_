import { describe, expect, it } from "vitest";
import { applyChartQuickCalc } from "@/lib/dashboard/chartQuickCalc";
import type { ChartConfig } from "@/lib/dashboard/buildChartConfig";

describe("chartQuickCalc", () => {
  const baseConfig: ChartConfig = {
    labels: ["A", "B"],
    datasets: [{ label: "m1", data: [25, 75] }],
  };

  it("percent_total divide by sum visible as ratio", () => {
    const out = applyChartQuickCalc(
      baseConfig,
      { type: "bar", aggregationConfig: { chartQuickCalc: "percent_total", chartYAxes: ["m1"] } },
      [
        { x: "A", m1: 25 },
        { x: "B", m1: 75 },
      ]
    );
    expect(out?.datasets[0]?.data?.[0]).toBeCloseTo(0.25, 5);
    expect(out?.datasets[0]?.data?.[1]).toBeCloseTo(0.75, 5);
  });

  it("vs_average usa índice 100 = promedio", () => {
    const out = applyChartQuickCalc(
      baseConfig,
      { type: "bar", aggregationConfig: { chartQuickCalc: "vs_average", chartYAxes: ["m1"] } },
      [
        { x: "A", m1: 25 },
        { x: "B", m1: 75 },
      ]
    );
    // avg = 50 → 25/50*100=50, 75/50*100=150
    expect(out?.datasets[0]?.data?.[0]).toBeCloseTo(50, 5);
    expect(out?.datasets[0]?.data?.[1]).toBeCloseTo(150, 5);
  });

  it("vs_max escala a máximo = 100", () => {
    const out = applyChartQuickCalc(
      baseConfig,
      { type: "bar", aggregationConfig: { chartQuickCalc: "vs_max", chartYAxes: ["m1"] } },
      [
        { x: "A", m1: 25 },
        { x: "B", m1: 75 },
      ]
    );
    expect(out?.datasets[0]?.data?.[0]).toBeCloseTo((25 / 75) * 100, 5);
    expect(out?.datasets[0]?.data?.[1]).toBeCloseTo(100, 5);
  });
});
