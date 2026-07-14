import { describe, expect, it } from "vitest";
import {
  fiscalMonthIndex,
  fiscalYearFromParts,
  normalizeFiscalYearStartMonth,
  sqlFiscalYearPartitionExpr,
} from "@/lib/dashboard/fiscalYear";

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
