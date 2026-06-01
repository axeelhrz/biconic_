import { describe, expect, it } from "vitest";
import {
  filterRowsToUserTimeScope,
  resolveDashboardKpiMainValueForScope,
} from "@/lib/dashboard/kpiFilterScope";

describe("filterRowsToUserTimeScope", () => {
  it("con YEAR=2026 excluye buckets de 2025 (solo referencia YoY)", () => {
    const rows = [
      { fecha: "2025-12", reach: 100 },
      { fecha: "2026-01", reach: 10 },
      { fecha: "2026-02", reach: 20 },
    ];
    const scoped = filterRowsToUserTimeScope(rows, {
      timeColumn: "fecha",
      granularity: "month",
      userFilters: [{ field: "anio", operator: "YEAR", value: 2026 }],
    });
    expect(scoped).toHaveLength(2);
    expect(resolveDashboardKpiMainValueForScope(rows, "reach", {
      timeColumn: "fecha",
      granularity: "month",
      userFilters: [{ field: "anio", operator: "YEAR", value: 2026 }],
    })).toBe(30);
  });

  it("sin filtro temporal devuelve todas las filas", () => {
    const rows = [{ fecha: "2026-01", v: 1 }];
    expect(
      filterRowsToUserTimeScope(rows, {
        timeColumn: "fecha",
        granularity: "month",
        userFilters: [{ field: "region", operator: "=", value: "AR" }],
      })
    ).toHaveLength(1);
  });
});
