import { describe, it, expect } from "vitest";
import {
  buildDashboardDataset,
  applyManualDimensionMapping,
  toLegacyDatasetDimensions,
  widgetSupportsDimension,
  normalizeColumnName,
} from "./dashboardDataset";

describe("dashboardDataset", () => {
  const ventas = {
    id: "src-ventas",
    etlId: "etl-1",
    alias: "Ventas",
    fields: {
      all: ["fecha_venta", "monto", "region"],
      numeric: ["monto"],
      string: ["region"],
      date: ["fecha_venta"],
    },
  };

  const marketing = {
    id: "src-mkt",
    etlId: "etl-2",
    alias: "Marketing",
    fields: {
      all: ["created_at", "spend", "provincia"],
      numeric: ["spend"],
      string: ["provincia"],
      date: ["created_at"],
    },
  };

  it("detecta date y region en múltiples fuentes", () => {
    const { dataset, datasetDimensions } = buildDashboardDataset([ventas, marketing]);
    expect(datasetDimensions.date?.["src-ventas"]).toBe("fecha_venta");
    expect(datasetDimensions.date?.["src-mkt"]).toBe("created_at");
    expect(datasetDimensions.region?.["src-ventas"]).toBe("region");
    expect(datasetDimensions.region?.["src-mkt"]).toBe("provincia");
  });

  it("respeta mapeo manual en rebuild", () => {
    const first = buildDashboardDataset([ventas, marketing]);
    const manual = applyManualDimensionMapping(
      first.dataset,
      "date",
      "src-mkt",
      "custom_date_col"
    );
    const rebuilt = buildDashboardDataset([ventas, marketing], manual);
    expect(rebuilt.datasetDimensions.date?.["src-mkt"]).toBe("custom_date_col");
    expect(rebuilt.datasetDimensions.date?.["src-ventas"]).toBe("fecha_venta");
  });

  it("widgetSupportsDimension según mapeo", () => {
    const { dataset } = buildDashboardDataset([ventas, marketing]);
    expect(widgetSupportsDimension("src-ventas", "date", dataset)).toBe(true);
    expect(widgetSupportsDimension("src-mkt", "date", dataset)).toBe(true);
    expect(widgetSupportsDimension("src-ventas", "product", dataset)).toBe(false);
  });

  it("toLegacyDatasetDimensions es consistente", () => {
    const { dataset } = buildDashboardDataset([ventas]);
    const legacy = toLegacyDatasetDimensions(dataset);
    expect(legacy.date?.["src-ventas"]).toBe("fecha_venta");
  });

  it("normalizeColumnName unifica comparación", () => {
    expect(normalizeColumnName("Fecha Venta")).toBe("fecha_venta");
  });
});
