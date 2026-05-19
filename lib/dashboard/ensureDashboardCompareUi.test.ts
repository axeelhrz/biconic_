import { describe, expect, it } from "vitest";
import {
  defaultComparePlacementsForWidgetType,
  ensureDashboardCompareUi,
  getEffectiveDashboardCompareUi,
  effectivePlacementEnabled,
} from "@/lib/dashboard/ensureDashboardCompareUi";

describe("defaultComparePlacementsForWidgetType", () => {
  it("KPI usa kpi_below", () => {
    expect(defaultComparePlacementsForWidgetType("kpi")).toEqual(["kpi_below"]);
  });
  it("tabla usa columnas extra", () => {
    expect(defaultComparePlacementsForWidgetType("table")).toEqual(["table_extra_columns"]);
  });
  it("línea incluye serie de referencia", () => {
    expect(defaultComparePlacementsForWidgetType("line")).toContain("line_reference_series");
  });
});

describe("ensureDashboardCompareUi", () => {
  it("sin compare devuelve undefined", () => {
    expect(ensureDashboardCompareUi({ compare: { kind: "none" } })).toBeUndefined();
  });

  it("con compare temporal habilita UI por defecto", () => {
    const ui = ensureDashboardCompareUi(
      {
        compare: {
          kind: "temporal",
          mode: "prev_bucket",
          timeColumn: "mes",
          granularity: "month",
        },
      },
      { widgetType: "kpi" }
    );
    expect(ui?.enabled).toBe(true);
    expect(ui?.placement).toEqual(["kpi_below"]);
    expect(ui?.showDelta).toBe(true);
  });

  it("respeta transformShowDelta false", () => {
    const ui = ensureDashboardCompareUi({
      compare: { kind: "fixed", value: 10 },
      transformShowDelta: false,
      transformShowDeltaPct: true,
    });
    expect(ui?.showDelta).toBe(false);
    expect(ui?.showDeltaPct).toBe(true);
  });

  it("legacy comparePeriod activa UI", () => {
    const ui = ensureDashboardCompareUi(
      { comparePeriod: "previous_month", dateDimension: "fecha" },
      { widgetType: "bar" }
    );
    expect(ui?.enabled).toBe(true);
  });

  it("preserva label y placement explícitos", () => {
    const ui = ensureDashboardCompareUi({
      compare: { kind: "fixed", value: 1 },
      dashboardCompareUi: { enabled: true, label: "vs meta", placement: ["tooltip"] },
    });
    expect(ui?.label).toBe("vs meta");
    expect(ui?.placement).toEqual(["tooltip"]);
  });
});

describe("getEffectiveDashboardCompareUi", () => {
  it("enabled false explícito no se sobreescribe", () => {
    const ui = getEffectiveDashboardCompareUi({
      compare: { kind: "fixed", value: 1 },
      dashboardCompareUi: { enabled: false },
    });
    expect(ui?.enabled).toBe(false);
  });

  it("sin dashboardCompareUi infiere enabled true", () => {
    const ui = getEffectiveDashboardCompareUi({
      compare: { kind: "column", refColumn: "meta" },
    });
    expect(ui?.enabled).toBe(true);
  });
});

describe("effectivePlacementEnabled", () => {
  it("KPI con compare sin ui explícita habilita kpi_below", () => {
    expect(
      effectivePlacementEnabled(
        {
          compare: {
            kind: "temporal",
            mode: "prev_bucket",
            timeColumn: "f",
            granularity: "month",
          },
        },
        "kpi_below",
        { widgetType: "kpi" }
      )
    ).toBe(true);
  });
});
