import { describe, expect, it } from "vitest";
import { buildTablePresentation } from "@/lib/dashboard/buildTablePresentation";

describe("buildTablePresentation", () => {
  const rows = [
    { region: "Norte", mes: "Ene", ventas: 100 },
    { region: "Norte", mes: "Feb", ventas: 120 },
    { region: "Sur", mes: "Ene", ventas: 80 },
    { region: "Sur", mes: "Feb", ventas: 90 },
  ];

  it("pivots with row and column dimensions", () => {
    const result = buildTablePresentation(rows, {
      tableRowFields: ["region"],
      tableColumnFields: ["mes"],
      chartYAxes: ["ventas"],
    });
    expect(result.pivoted).toBe(true);
    expect(result.columns).toEqual(["region", "Ene", "Feb"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ region: "Norte", Ene: 100, Feb: 120 });
  });

  it("renders flat table with column fields and metrics", () => {
    const result = buildTablePresentation(rows, {
      tableColumnFields: ["region", "mes"],
      chartYAxes: ["ventas"],
    });
    expect(result.pivoted).toBe(false);
    expect(result.columns).toEqual(["region", "mes", "ventas"]);
    expect(result.rows).toHaveLength(4);
  });
});
