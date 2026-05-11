import { describe, expect, it } from "vitest";
import {
  buildDetailCardLineStrings,
  interpolateDetailTitle,
  normalizeChartDetailCard,
  resolveDetailCardRow,
} from "./chartDetailCard";
import type { BuildChartConfigWidget, ChartConfig } from "./buildChartConfig";

describe("normalizeChartDetailCard", () => {
  it("returns undefined when no lines", () => {
    expect(normalizeChartDetailCard({ enabled: true, lines: [] })).toBeUndefined();
    expect(normalizeChartDetailCard(null)).toBeUndefined();
  });

  it("normalizes row and computed lines", () => {
    const cfg = normalizeChartDetailCard({
      enabled: true,
      title: "{{category}}",
      description: "Ayuda",
      lines: [
        { id: "a", kind: "row", label: "Ventas", field: "sum_ventas", valueFormat: "currency", decimals: 0 },
        {
          id: "b",
          kind: "computed",
          label: "Part.",
          computed: "percent_of_total",
          numeratorField: "sum_ventas",
          decimals: 1,
        },
      ],
    });
    expect(cfg?.lines).toHaveLength(2);
    expect(cfg?.description).toBe("Ayuda");
    expect(cfg?.lines?.[0]?.kind).toBe("row");
    expect(cfg?.lines?.[1]?.kind).toBe("computed");
  });
});

describe("interpolateDetailTitle", () => {
  it("replaces placeholders", () => {
    expect(interpolateDetailTitle("{{category}} · {{series}}", "Córdoba", "Serie A")).toBe("Córdoba · Serie A");
  });
});

describe("buildDetailCardLineStrings", () => {
  const widget: BuildChartConfigWidget = {
    type: "bar",
    aggregationConfig: {
      enabled: true,
      chartXAxis: "provincia",
      chartYAxes: ["sum_ventas", "ops"],
      metrics: [
        { alias: "sum_ventas", func: "SUM", field: "ventas" },
        { alias: "ops", func: "SUM", field: "n" },
      ],
    },
  };
  const detail = normalizeChartDetailCard({
    lines: [
      { kind: "row", label: "Ventas", field: "sum_ventas", valueFormat: "currency", decimals: 0, id: "1" },
      {
        kind: "computed",
        label: "Participación",
        computed: "percent_of_total",
        numeratorField: "sum_ventas",
        decimals: 1,
        id: "2",
      },
    ],
  })!;

  it("formats row and percent of total", () => {
    const row = { provincia: "Córdoba", sum_ventas: 42500000, ops: 1245 };
    const allRows = [
      { provincia: "Córdoba", sum_ventas: 42500000, ops: 1245 },
      { provincia: "Buenos Aires", sum_ventas: 100000000, ops: 3000 },
    ];
    const lines = buildDetailCardLineStrings({ detail, row, allRows, widget });
    expect(lines[0]).toMatch(/Ventas:/);
    expect(lines[0]).toContain("$");
    expect(lines[1]).toMatch(/Participación:/);
    expect(lines[1]).toMatch(/%$/);
  });

  it("applies valueScale M to currency row", () => {
    const d = normalizeChartDetailCard({
      lines: [
        {
          id: "1",
          kind: "row",
          label: "Ventas",
          field: "sum_ventas",
          valueFormat: "currency",
          valueScale: "M",
          decimals: 2,
          currencySymbol: "$",
        },
      ],
    })!;
    const s = buildDetailCardLineStrings({
      detail: d,
      row: { sum_ventas: 42_500_000 },
      allRows: [{ sum_ventas: 42_500_000 }],
      widget,
    })[0]!;
    expect(s).toMatch(/Ventas:/);
    expect(s).toMatch(/M/);
  });
});

describe("resolveDetailCardRow", () => {
  it("matches row by x raw key for simple bar", () => {
    const rows = [
      { mes: "2024-01", total: 10 },
      { mes: "2024-02", total: 20 },
    ];
    const widget: BuildChartConfigWidget = {
      type: "bar",
      aggregationConfig: {
        enabled: true,
        chartXAxis: "mes",
        chartYAxes: ["total"],
        metrics: [
          { alias: "total", func: "SUM", field: "x" },
        ],
      },
    };
    const chartConfig: ChartConfig = {
      labels: ["2024-01", "2024-02"],
      xRawCategoryKeys: ["2024-01", "2024-02"],
      datasets: [{ label: "total", data: [10, 20] }],
    };
    const r0 = resolveDetailCardRow({
      rows,
      widget,
      chartConfig,
      dataIndex: 0,
      datasetIndex: 0,
      chartType: "bar",
    });
    expect(r0?.total).toBe(10);
  });
});
