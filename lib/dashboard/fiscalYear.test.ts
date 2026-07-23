import { describe, expect, it } from "vitest";
import {
  fiscalMonthIndex,
  fiscalQuarterIndex,
  fiscalSemesterIndex,
  fiscalYearFromParts,
  normalizeFiscalYearStartMonth,
  sqlFiscalAwareDateGroupExprs,
  sqlFiscalYearPartitionExpr,
} from "@/lib/dashboard/fiscalYear";
import { formatDateByGranularity } from "@/lib/dashboard/dateFormatting";

describe("normalizeFiscalYearStartMonth", () => {
  it("devuelve 1 por defecto", () => {
    expect(normalizeFiscalYearStartMonth(undefined)).toBe(1);
    expect(normalizeFiscalYearStartMonth(0)).toBe(1);
    expect(normalizeFiscalYearStartMonth(13)).toBe(1);
  });

  it("acepta meses válidos", () => {
    expect(normalizeFiscalYearStartMonth(7)).toBe(7);
  });
});

describe("fiscalYearFromParts", () => {
  it("año calendario cuando inicio es enero", () => {
    expect(fiscalYearFromParts(2025, 3, 1)).toBe(2025);
    expect(fiscalYearFromParts(2025, 12, 1)).toBe(2025);
  });

  it("año fiscal julio–junio", () => {
    expect(fiscalYearFromParts(2025, 7, 7)).toBe(2025);
    expect(fiscalYearFromParts(2025, 6, 7)).toBe(2024);
    expect(fiscalYearFromParts(2025, 1, 7)).toBe(2024);
  });
});

describe("fiscalMonthIndex", () => {
  it("índice calendario con enero", () => {
    expect(fiscalMonthIndex(3, 1)).toBe(3);
  });

  it("índice dentro del FY julio", () => {
    expect(fiscalMonthIndex(7, 7)).toBe(1);
    expect(fiscalMonthIndex(6, 7)).toBe(12);
    expect(fiscalMonthIndex(1, 7)).toBe(7);
  });
});

describe("fiscalQuarterIndex / fiscalSemesterIndex", () => {
  it("trimestres fiscales con inicio julio", () => {
    expect(fiscalQuarterIndex(7, 7)).toBe(1);
    expect(fiscalQuarterIndex(10, 7)).toBe(2);
    expect(fiscalQuarterIndex(1, 7)).toBe(3);
    expect(fiscalQuarterIndex(4, 7)).toBe(4);
  });

  it("semestres fiscales con inicio julio", () => {
    expect(fiscalSemesterIndex(7, 7)).toBe(1);
    expect(fiscalSemesterIndex(12, 7)).toBe(1);
    expect(fiscalSemesterIndex(1, 7)).toBe(2);
    expect(fiscalSemesterIndex(6, 7)).toBe(2);
  });
});

describe("sqlFiscalYearPartitionExpr", () => {
  it("usa EXTRACT(YEAR) para año calendario", () => {
    expect(sqlFiscalYearPartitionExpr('"fecha"::date', 1)).toBe('EXTRACT(YEAR FROM "fecha"::date)');
  });

  it("usa CASE para FY no calendario", () => {
    const sql = sqlFiscalYearPartitionExpr('"fecha"::date', 7);
    expect(sql).toContain("CASE WHEN");
    expect(sql).toContain(">= 7");
  });
});

describe("sqlFiscalAwareDateGroupExprs", () => {
  it("agrupa año fiscal con inicio julio", () => {
    const exprs = sqlFiscalAwareDateGroupExprs('"fecha"', "year", 7);
    expect(exprs).not.toBeNull();
    expect(exprs!.groupExpr).toContain("CASE WHEN");
    expect(exprs!.displayExpr).toContain("::text");
  });

  it("agrupa trimestre fiscal", () => {
    const exprs = sqlFiscalAwareDateGroupExprs('"fecha"', "quarter", 7);
    expect(exprs).not.toBeNull();
    expect(exprs!.displayExpr).toContain("'T'");
    expect(exprs!.groupExpr).toContain("-Q");
  });

  it("devuelve null para month (calendario)", () => {
    expect(sqlFiscalAwareDateGroupExprs('"fecha"', "month", 7)).toBeNull();
  });
});

describe("formatDateByGranularity con año fiscal", () => {
  it("etiqueta año/trimestre/semestre fiscales", () => {
    expect(
      formatDateByGranularity("2025-03-15", "year", undefined, { fiscalYearStartMonth: 7 })
    ).toBe("2024");
    expect(
      formatDateByGranularity("2025-03-15", "quarter", undefined, { fiscalYearStartMonth: 7 })
    ).toBe("T3/2024");
    expect(
      formatDateByGranularity("2025-03-15", "semester", undefined, { fiscalYearStartMonth: 7 })
    ).toBe("S2/2024");
  });

  it("preserva etiquetas ya formateadas", () => {
    expect(formatDateByGranularity("T1/2024", "quarter", undefined, { fiscalYearStartMonth: 7 })).toBe(
      "T1/2024"
    );
  });
});
