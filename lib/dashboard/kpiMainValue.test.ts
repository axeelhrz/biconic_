import { describe, expect, it } from "vitest";
import { resolveDashboardKpiMainValue } from "@/lib/dashboard/compareDisplayKeys";

describe("resolveDashboardKpiMainValue", () => {
  it("suma todas las filas cuando hay serie temporal (varios buckets)", () => {
    const rows = [
      { fecha: "2024-01", ventas: 10_000_000 },
      { fecha: "2024-02", ventas: 9_000_000 },
      { fecha: "2024-03", ventas: 10_143_300 },
    ];
    expect(resolveDashboardKpiMainValue(rows, "ventas")).toBe(29_143_300);
    expect(resolveDashboardKpiMainValue(rows, "ventas")).not.toBe(10_143_300);
  });

  it("con una sola fila devuelve ese valor", () => {
    const rows = [{ ventas: 29_143_300 }];
    expect(resolveDashboardKpiMainValue(rows, "ventas")).toBe(29_143_300);
  });

  it("ignora valores no numéricos", () => {
    const rows = [
      { ventas: 100 },
      { ventas: "x" as unknown as number },
      { ventas: 50 },
    ];
    expect(resolveDashboardKpiMainValue(rows, "ventas")).toBe(150);
  });

  it("sin filas devuelve 0", () => {
    expect(resolveDashboardKpiMainValue([], "ventas")).toBe(0);
  });
});
