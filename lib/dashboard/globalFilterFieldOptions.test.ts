import { describe, expect, it } from "vitest";
import {
  buildGlobalFilterFieldOptions,
  globalFilterFieldLabel,
} from "@/lib/dashboard/globalFilterFieldOptions";
import type { ETLDataResponse } from "@/hooks/admin/useAdminDashboardEtlData";

const baseEtlData = {
  fields: { all: ["zona", "vendedor"], numeric: [], string: ["zona", "vendedor"], date: [] },
  dataSources: [{ id: "primary", etlId: "e1", alias: "Principal", etlName: "Test", schema: "etl_output", tableName: "t", rowCount: 1, fields: { all: [], numeric: [], string: [], date: [] } }],
} as unknown as ETLDataResponse;

describe("buildGlobalFilterFieldOptions", () => {
  it("includes derived columns not present in physical fields", () => {
    const options = buildGlobalFilterFieldOptions({
      etlData: baseEtlData,
      derivedColumns: [{ name: "total_linea", expression: "cantidad * precio" }],
      savedMetrics: [],
    });
    expect(options.map((o) => o.value)).toContain("total_linea");
    expect(options.find((o) => o.value === "total_linea")?.label).toBe("total_linea (calculada)");
  });

  it("excludes saved metric names", () => {
    const options = buildGlobalFilterFieldOptions({
      etlData: { ...baseEtlData, fields: { ...baseEtlData.fields, all: ["ventas", "zona"] } },
      derivedColumns: [],
      savedMetrics: [{ name: "ventas" }],
    });
    expect(options.map((o) => o.value)).not.toContain("ventas");
    expect(options.map((o) => o.value)).toContain("zona");
  });

  it("respects excludeFields for add-filter dropdown", () => {
    const options = buildGlobalFilterFieldOptions({
      etlData: baseEtlData,
      derivedColumns: [{ name: "total_linea", expression: "a + b" }],
      savedMetrics: [],
      excludeFields: ["zona"],
    });
    expect(options.map((o) => o.value)).not.toContain("zona");
    expect(options.map((o) => o.value)).toContain("total_linea");
  });
});

describe("globalFilterFieldLabel", () => {
  it("marks derived columns in label", () => {
    expect(
      globalFilterFieldLabel("total_linea", baseEtlData, [{ name: "total_linea", expression: "a+b" }])
    ).toBe("total_linea (calculada)");
  });
});
