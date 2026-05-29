import { describe, expect, it } from "vitest";
import {
  buildDashboardCompareContexts,
  extractTemporalAnchor,
  shiftFyLabel,
  shiftFiltersForCompare,
} from "@/lib/dashboard/compareContext";

describe("shiftFyLabel", () => {
  it("desplaza FY26 a FY25", () => {
    expect(shiftFyLabel("FY26")).toBe("FY25");
    expect(shiftFyLabel("FY2026")).toBe("FY2025");
  });
});

describe("extractTemporalAnchor", () => {
  it("detecta filtro FY", () => {
    const anchor = extractTemporalAnchor([{ field: "fy", operator: "=", value: "FY26" }]);
    expect(anchor).toEqual({ kind: "fy", field: "fy", values: ["FY26"] });
  });

  it("detecta YEAR + MONTH", () => {
    const anchor = extractTemporalAnchor([
      { field: "fecha", operator: "YEAR", value: 2026 },
      { field: "fecha", operator: "MONTH", value: [1, 2, 3] },
    ]);
    expect(anchor?.kind).toBe("month_only");
  });

  it("detecta = con valor año", () => {
    const anchor = extractTemporalAnchor([{ field: "fecha", operator: "=", value: "2026" }]);
    expect(anchor).toEqual({ kind: "year", field: "fecha", years: [2026] });
  });

  it("detecta YEAR + QUARTER en el mismo campo", () => {
    const anchor = extractTemporalAnchor([
      { field: "fecha", operator: "YEAR", value: 2026 },
      { field: "fecha", operator: "QUARTER", value: 1 },
    ]);
    expect(anchor).toEqual({ kind: "quarter", field: "fecha", quarters: [1], years: [2026] });
  });
});

describe("shiftFiltersForCompare", () => {
  it("FY26 + meses 1,2,3 → FY25 + mismos meses (YoY)", () => {
    const filters = [
      { field: "fy", operator: "=", value: "FY26" },
      { field: "mes", operator: "MONTH", value: [1, 2, 3] },
      { field: "pais", operator: "=", value: "Argentina" },
    ];
    const spec = {
      kind: "temporal" as const,
      mode: "same_period_prior_year" as const,
      timeColumn: "mes",
      granularity: "month" as const,
    };
    const shifted = shiftFiltersForCompare(filters, spec);
    const fy = shifted.find((f) => f.field === "fy");
    const mes = shifted.find((f) => f.field === "mes");
    const pais = shifted.find((f) => f.field === "pais");
    expect(fy?.value).toBe("FY25");
    expect(mes?.value).toEqual([1, 2, 3]);
    expect(pais?.value).toBe("Argentina");
  });

  it("YEAR=2026 + MONTH=4 → YEAR=2025, MONTH=4", () => {
    const filters = [
      { field: "fecha", operator: "YEAR", value: 2026 },
      { field: "fecha", operator: "MONTH", value: 4 },
    ];
    const spec = {
      kind: "temporal" as const,
      mode: "same_period_prior_year" as const,
      timeColumn: "fecha",
      granularity: "month" as const,
    };
    const shifted = shiftFiltersForCompare(filters, spec);
    const year = shifted.find((f) => String(f.operator).toUpperCase() === "YEAR");
    const month = shifted.find((f) => String(f.operator).toUpperCase() === "MONTH");
    expect(year?.value).toBe(2025);
    expect(month?.value).toBe(4);
  });

  it("= 2026 → = 2025 para YoY", () => {
    const filters = [{ field: "fecha", operator: "=", value: "2026" }];
    const spec = {
      kind: "temporal" as const,
      mode: "same_period_prior_year" as const,
      timeColumn: "fecha",
      granularity: "month" as const,
    };
    const shifted = shiftFiltersForCompare(filters, spec);
    expect(shifted[0]?.value).toBe(2025);
  });
});

describe("buildDashboardCompareContexts", () => {
  it("sin filtro temporal → no comparable", () => {
    const ctx = buildDashboardCompareContexts({
      filters: [{ field: "pais", operator: "=", value: "Argentina" }],
      compareSpec: {
        kind: "temporal",
        mode: "same_period_prior_year",
        timeColumn: "fecha",
        granularity: "month",
      },
    });
    expect(ctx.comparable).toBe(false);
    expect(ctx.unavailableReason).toBe("Sin período disponible");
  });

  it("FY parcial comparable con dual query", () => {
    const ctx = buildDashboardCompareContexts({
      filters: [
        { field: "fy", operator: "=", value: "FY26" },
        { field: "mes", operator: "MONTH", value: [1, 2, 3] },
      ],
      compareSpec: {
        kind: "temporal",
        mode: "same_period_prior_year",
        timeColumn: "mes",
        granularity: "month",
      },
    });
    expect(ctx.comparable).toBe(true);
    expect(ctx.usesDualQuery).toBe(true);
    const fyCompare = ctx.comparativeFilters.find((f) => f.field === "fy");
    expect(fyCompare?.value).toBe("FY25");
  });

  it("fixed no usa dual query", () => {
    const ctx = buildDashboardCompareContexts({
      filters: [{ field: "pais", operator: "=", value: "AR" }],
      compareSpec: { kind: "fixed", value: 100 },
    });
    expect(ctx.comparable).toBe(true);
    expect(ctx.usesDualQuery).toBe(false);
  });
});
