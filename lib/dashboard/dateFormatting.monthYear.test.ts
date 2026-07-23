import { describe, expect, it } from "vitest";
import {
  formatAnalysisDateForChart,
  formatMonthYearEnLabel,
  parseDateLike,
  parseMonthYearLabel,
} from "./dateFormatting";

describe("parseMonthYearLabel ES/EN", () => {
  it("parses English Apr/Aug/Dec", () => {
    expect(parseMonthYearLabel("Apr-2026")).toEqual({ year: 2026, month: 4 });
    expect(parseMonthYearLabel("Aug-2026")).toEqual({ year: 2026, month: 8 });
    expect(parseMonthYearLabel("Dec-2026")).toEqual({ year: 2026, month: 12 });
  });

  it("parses Spanish Abr/Ago/Dic (no como enero)", () => {
    expect(parseMonthYearLabel("Abr-2026")).toEqual({ year: 2026, month: 4 });
    expect(parseMonthYearLabel("Ago-2026")).toEqual({ year: 2026, month: 8 });
    expect(parseMonthYearLabel("Dic-2026")).toEqual({ year: 2026, month: 12 });
    expect(parseMonthYearLabel("Ene-2026")).toEqual({ year: 2026, month: 1 });
  });

  it("supports mmm-yy and space separator", () => {
    expect(parseMonthYearLabel("Abr-26")).toEqual({ year: 2026, month: 4 });
    expect(parseMonthYearLabel("Abr 2026")).toEqual({ year: 2026, month: 4 });
  });
});

describe("parseDateLike Spanish month labels", () => {
  it("does not map Abr/Ago/Dic to January via Date fallback", () => {
    const abr = parseDateLike("Abr-2026");
    expect(abr).not.toBeNull();
    expect(abr!.getUTCMonth()).toBe(3); // April
    expect(abr!.getUTCFullYear()).toBe(2026);

    const ago = parseDateLike("Ago-2026");
    expect(ago!.getUTCMonth()).toBe(7); // August

    const dic = parseDateLike("Dic-2026");
    expect(dic!.getUTCMonth()).toBe(11); // December
  });

  it("still parses English labels", () => {
    expect(parseDateLike("Apr-2026")!.getUTCMonth()).toBe(3);
    expect(parseDateLike("Aug-2026")!.getUTCMonth()).toBe(7);
    expect(parseDateLike("Dec-2026")!.getUTCMonth()).toBe(11);
  });
});

describe("format round-trip monthYear", () => {
  it("formats Spanish labels back correctly", () => {
    expect(formatAnalysisDateForChart("Abr-2026", "month", "monthYear")).toBe("Abr 2026");
    expect(formatAnalysisDateForChart("Ago-2026", "month", "monthYear")).toBe("Ago 2026");
    expect(formatAnalysisDateForChart("Dic-2026", "month", "monthYear")).toBe("Dic 2026");
  });

  it("normalizes Spanish to English Mon-YYYY for comparative keys", () => {
    expect(formatMonthYearEnLabel("Abr-2026")).toBe("Apr-2026");
    expect(formatMonthYearEnLabel("Ago-2026")).toBe("Aug-2026");
    expect(formatMonthYearEnLabel("Dic-2026")).toBe("Dec-2026");
  });
});
