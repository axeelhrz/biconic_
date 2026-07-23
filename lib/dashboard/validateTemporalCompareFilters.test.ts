import { describe, expect, it } from "vitest";
import {
  detectAppliedTemporalFilterLevels,
  requiredTemporalLevelForCompare,
  validateTemporalCompareAgainstFilters,
} from "@/lib/dashboard/validateTemporalCompareFilters";
import { buildDashboardCompareContexts } from "@/lib/dashboard/compareContext";

describe("requiredTemporalLevelForCompare", () => {
  it("mapea modos calendario", () => {
    expect(
      requiredTemporalLevelForCompare({
        kind: "temporal",
        mode: "calendar_prev_year",
        timeColumn: "fecha",
        granularity: "day",
      })
    ).toBe("year");
    expect(
      requiredTemporalLevelForCompare({
        kind: "temporal",
        mode: "calendar_prev_month",
        timeColumn: "fecha",
        granularity: "day",
      })
    ).toBe("month");
    expect(
      requiredTemporalLevelForCompare({
        kind: "temporal",
        mode: "calendar_prev_day",
        timeColumn: "fecha",
        granularity: "day",
      })
    ).toBe("day");
  });

  it("usa granularidad en prev_bucket / same_period_prior_year", () => {
    expect(
      requiredTemporalLevelForCompare({
        kind: "temporal",
        mode: "prev_bucket",
        timeColumn: "fecha",
        granularity: "month",
      })
    ).toBe("month");
    expect(
      requiredTemporalLevelForCompare({
        kind: "temporal",
        mode: "same_period_prior_year",
        timeColumn: "fecha",
        granularity: "year",
      })
    ).toBe("year");
  });
});

describe("detectAppliedTemporalFilterLevels", () => {
  it("detecta YEAR + MONTH + DAY", () => {
    const levels = detectAppliedTemporalFilterLevels([
      { field: "fecha", operator: "YEAR", value: 2026 },
      { field: "fecha", operator: "MONTH", value: 4 },
      { field: "fecha", operator: "DAY", value: 15 },
    ]);
    expect(levels.hasYear).toBe(true);
    expect(levels.hasMonth).toBe(true);
    expect(levels.hasDay).toBe(true);
  });

  it("YEAR_MONTH cuenta como año+mes", () => {
    const levels = detectAppliedTemporalFilterLevels([
      { field: "fecha", operator: "YEAR_MONTH", value: "2026-04" },
    ]);
    expect(levels.hasYearMonth).toBe(true);
    expect(levels.hasYear).toBe(true);
    expect(levels.hasMonth).toBe(true);
  });
});

describe("validateTemporalCompareAgainstFilters", () => {
  it("año: exige filtro de año", () => {
    const fail = validateTemporalCompareAgainstFilters(
      {
        kind: "temporal",
        mode: "calendar_prev_year",
        timeColumn: "fecha",
        granularity: "year",
      },
      [{ field: "pais", operator: "=", value: "AR" }]
    );
    expect(fail.ok).toBe(false);
    expect(fail.reason).toMatch(/año/i);

    const ok = validateTemporalCompareAgainstFilters(
      {
        kind: "temporal",
        mode: "calendar_prev_year",
        timeColumn: "fecha",
        granularity: "year",
      },
      [{ field: "fecha", operator: "YEAR", value: 2026 }]
    );
    expect(ok.ok).toBe(true);
  });

  it("mes: exige año + mes", () => {
    const onlyYear = validateTemporalCompareAgainstFilters(
      {
        kind: "temporal",
        mode: "prev_bucket",
        timeColumn: "fecha",
        granularity: "month",
      },
      [{ field: "fecha", operator: "YEAR", value: 2026 }]
    );
    expect(onlyYear.ok).toBe(false);
    expect(onlyYear.missing).toContain("month");
    expect(onlyYear.reason).toMatch(/año y mes/i);

    const yearMonth = validateTemporalCompareAgainstFilters(
      {
        kind: "temporal",
        mode: "calendar_prev_month",
        timeColumn: "fecha",
        granularity: "month",
      },
      [
        { field: "fecha", operator: "YEAR", value: 2026 },
        { field: "fecha", operator: "MONTH", value: 4 },
      ]
    );
    expect(yearMonth.ok).toBe(true);
  });

  it("día: exige año + mes + día", () => {
    const noDay = validateTemporalCompareAgainstFilters(
      {
        kind: "temporal",
        mode: "calendar_prev_day",
        timeColumn: "fecha",
        granularity: "day",
      },
      [
        { field: "fecha", operator: "YEAR", value: 2026 },
        { field: "fecha", operator: "MONTH", value: 4 },
      ]
    );
    expect(noDay.ok).toBe(false);
    expect(noDay.missing).toContain("day");
    expect(noDay.reason).toMatch(/año, mes y día/i);

    const full = validateTemporalCompareAgainstFilters(
      {
        kind: "temporal",
        mode: "calendar_prev_day",
        timeColumn: "fecha",
        granularity: "day",
      },
      [
        { field: "fecha", operator: "YEAR", value: 2026 },
        { field: "fecha", operator: "MONTH", value: 4 },
        { field: "fecha", operator: "DAY", value: 10 },
      ]
    );
    expect(full.ok).toBe(true);
  });
});

describe("buildDashboardCompareContexts + nivel temporal", () => {
  it("bloquea compare mes si solo hay YEAR", () => {
    const ctx = buildDashboardCompareContexts({
      filters: [{ field: "fecha", operator: "YEAR", value: 2026 }],
      compareSpec: {
        kind: "temporal",
        mode: "prev_bucket",
        timeColumn: "fecha",
        granularity: "month",
      },
    });
    expect(ctx.comparable).toBe(false);
    expect(ctx.unavailableReason).toMatch(/año y mes/i);
  });

  it("permite compare mes con YEAR + MONTH", () => {
    const ctx = buildDashboardCompareContexts({
      filters: [
        { field: "fecha", operator: "YEAR", value: 2026 },
        { field: "fecha", operator: "MONTH", value: 4 },
      ],
      compareSpec: {
        kind: "temporal",
        mode: "same_period_prior_year",
        timeColumn: "fecha",
        granularity: "month",
      },
    });
    expect(ctx.comparable).toBe(true);
  });

  it("bloquea compare día sin DAY", () => {
    const ctx = buildDashboardCompareContexts({
      filters: [
        { field: "fecha", operator: "YEAR", value: 2026 },
        { field: "fecha", operator: "MONTH", value: 4 },
      ],
      compareSpec: {
        kind: "temporal",
        mode: "calendar_prev_day",
        timeColumn: "fecha",
        granularity: "day",
      },
    });
    expect(ctx.comparable).toBe(false);
    expect(ctx.unavailableReason).toMatch(/día/i);
  });
});
