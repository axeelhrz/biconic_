import { describe, expect, it } from "vitest";
import { applyCompareSpecToRows, shiftBucketLabelOneYear } from "@/lib/dashboard/compareMetricRows";

describe("shiftBucketLabelOneYear", () => {
  it("desplaza yyyy-MM un año", () => {
    expect(shiftBucketLabelOneYear("2025-03", "month")).toBe("2024-03");
  });

  it("desplaza trimestre", () => {
    expect(shiftBucketLabelOneYear("T1/2025", "quarter")).toBe("T1/2024");
  });
});

describe("applyCompareSpecToRows", () => {
  it("prev_bucket: LAG por partición", () => {
    const rows = [
      { mes: "2025-01", cat: "A", ventas: 10 },
      { mes: "2025-02", cat: "A", ventas: 20 },
      { mes: "2025-01", cat: "B", ventas: 5 },
      { mes: "2025-02", cat: "B", ventas: 15 },
    ];
    const out = applyCompareSpecToRows(
      rows,
      ["ventas"],
      { kind: "temporal", mode: "prev_bucket", timeColumn: "mes", granularity: "month" },
      { dimensionColumns: ["mes", "cat"] }
    );
    const febA = out.find((r) => r.mes === "2025-02" && r.cat === "A");
    expect(febA?.ventas_prev).toBe(10);
    expect(febA?.ventas_delta).toBe(10);
    const janA = out.find((r) => r.mes === "2025-01" && r.cat === "A");
    expect(janA?.ventas_prev).toBeNull();
  });

  it("same_period_prior_year: busca etiqueta desplazada", () => {
    const rows = [
      { mes: "2024-03", m: 100 },
      { mes: "2025-03", m: 130 },
    ];
    const out = applyCompareSpecToRows(
      rows,
      ["m"],
      { kind: "temporal", mode: "same_period_prior_year", timeColumn: "mes", granularity: "month" },
      { dimensionColumns: ["mes"] }
    );
    const r2025 = out.find((r) => r.mes === "2025-03");
    expect(r2025?.m_prev).toBe(100);
    expect(r2025?.m_delta).toBe(30);
  });

  it("fixed: vs_fijo", () => {
    const rows = [{ x: 12 }];
    const out = applyCompareSpecToRows(rows, ["x"], { kind: "fixed", value: 10 }, { dimensionColumns: [] });
    expect(out[0]?.x_vs_fijo).toBe(2);
  });

  it("average global", () => {
    const rows = [{ v: 10 }, { v: 20 }];
    const out = applyCompareSpecToRows(rows, ["v"], { kind: "average", scope: "global", partitionDimensions: [] }, { dimensionColumns: [] });
    expect(out[0]?.v_vs_prom).toBe(-5);
    expect(out[1]?.v_vs_prom).toBe(5);
  });

  it("total_share", () => {
    const rows = [
      { d: "A", v: 25 },
      { d: "A", v: 75 },
    ];
    const out = applyCompareSpecToRows(
      rows,
      ["v"],
      { kind: "total_share", partitionDimensions: ["d"] },
      { dimensionColumns: ["d"] }
    );
    expect(out[0]?.v_pct_total).toBe(25);
    expect(out[1]?.v_pct_total).toBe(75);
  });
});
