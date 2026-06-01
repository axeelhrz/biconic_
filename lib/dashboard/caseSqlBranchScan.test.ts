import { describe, it, expect } from "vitest";
import {
  findThenBranchBoundary,
  findElseBranchClosingEnd,
  skipWsSql,
} from "@/lib/dashboard/caseSqlBranchScan";

describe("findThenBranchBoundary", () => {
  it("no confunde WHEN/END de un CASE anidado en THEN con el del CASE exterior", () => {
    const s = "CASE WHEN a THEN CASE WHEN b THEN 1 ELSE 2 END ELSE 3 END";
    const thenIdx = s.indexOf("THEN", s.indexOf("WHEN a"));
    const afterThen = skipWsSql(s, thenIdx + 4);
    const boundary = findThenBranchBoundary(s, afterThen);
    const outerElse = s.indexOf("ELSE 3");
    expect(boundary).toBe(outerElse);
    expect(s.slice(afterThen, boundary).trim()).toBe("CASE WHEN b THEN 1 ELSE 2 END");
  });

  it("rama THEN sin ELSE: el límite es el END del CASE", () => {
    const s = "CASE WHEN x THEN 0 END";
    const thenIdx = s.indexOf("THEN", s.indexOf("WHEN x"));
    const afterThen = skipWsSql(s, thenIdx + 4);
    const boundary = findThenBranchBoundary(s, afterThen);
    expect(boundary).toBe(s.indexOf("END"));
    expect(s.slice(afterThen, boundary).trim()).toBe("0");
  });
});

describe("findElseBranchClosingEnd", () => {
  it("encuentra el END exterior cuando ELSE es un CASE … END completo", () => {
    const s = "CASE WHEN x THEN y ELSE CASE WHEN a THEN b END END";
    const elseIdx = s.indexOf("ELSE", s.indexOf("WHEN x"));
    const afterElse = skipWsSql(s, elseIdx + 4);
    const endIdx = findElseBranchClosingEnd(s, afterElse);
    expect(endIdx).toBe(s.lastIndexOf("END"));
    expect(s.slice(afterElse, endIdx).trim()).toBe("CASE WHEN a THEN b END");
  });
});
