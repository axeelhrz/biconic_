import { describe, it, expect } from "vitest";
import { toSqlLiteral } from "@/lib/dashboard/toSqlLiteral";

describe("toSqlLiteral", () => {
  it("emite números entre comillas simples para compatibilidad con columnas text en PG", () => {
    expect(toSqlLiteral(999999)).toBe("'999999'");
    expect(toSqlLiteral(0)).toBe("'0'");
    expect(toSqlLiteral(-3.5)).toBe("'-3.5'");
  });

  it("preserva NULL y booleanos", () => {
    expect(toSqlLiteral(null)).toBe("NULL");
    expect(toSqlLiteral(true)).toBe("TRUE");
    expect(toSqlLiteral(false)).toBe("FALSE");
  });
});
