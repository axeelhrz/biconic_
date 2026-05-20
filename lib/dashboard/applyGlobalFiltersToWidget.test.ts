import { describe, it, expect } from "vitest";
import {
  resolveGlobalFilterPhysicalField,
  widgetSupportsDimension,
  getSourcesForSemanticDistinct,
} from "./applyGlobalFiltersToWidget";
import { buildDashboardDataset } from "./dashboardDataset";

describe("applyGlobalFiltersToWidget", () => {
  const sources = [
    {
      id: "s1",
      etlId: "e1",
      alias: "A",
      fields: {
        all: ["fecha", "region"],
        numeric: [],
        string: ["region"],
        date: ["fecha"],
      },
    },
    {
      id: "s2",
      etlId: "e2",
      alias: "B",
      fields: {
        all: ["created_at"],
        numeric: [],
        string: [],
        date: ["created_at"],
      },
    },
  ];

  const { dataset, datasetDimensions } = buildDashboardDataset(sources);

  it("omite filtro date en fuente sin mapeo de region", () => {
    expect(
      resolveGlobalFilterPhysicalField({
        filterField: "region",
        operatorUpper: "=",
        sourceId: "s2",
        dataset,
        datasetDimensions,
      })
    ).toBeNull();
  });

  it("aplica filtro date en fuente con mapeo", () => {
    expect(
      resolveGlobalFilterPhysicalField({
        filterField: "date",
        operatorUpper: "YEAR",
        sourceId: "s2",
        dataset,
        datasetDimensions,
        agg: { dateGroupByGranularity: "month" },
      })
    ).toBe("created_at");
  });

  it("getSourcesForSemanticDistinct devuelve ambas fuentes para date", () => {
    const rows = getSourcesForSemanticDistinct("date", [
      { id: "s1", tableName: "t1", schema: "etl_output" },
      { id: "s2", tableName: "t2", schema: "etl_output" },
    ], datasetDimensions);
    expect(rows).toHaveLength(2);
  });

  it("widgetSupportsDimension", () => {
    expect(widgetSupportsDimension("s1", "date", dataset)).toBe(true);
    expect(widgetSupportsDimension("s2", "region", dataset)).toBe(false);
  });
});
