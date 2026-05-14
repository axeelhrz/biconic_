import { describe, it, expect } from "vitest";
import { expressionToSql } from "@/lib/dashboard/metricExpressionToSql";

describe("expressionToSql", () => {
  it("acepta IFS con literales con tilde dentro de comillas (no falla el whitelist ASCII)", () => {
    const expr =
      "IFS(AND(fy='FY24';pais_medio='Argentina');0.05;AND(fy='FY24';pais_medio='México');0.16;AND(fy='FY24';pais_medio='Panamá');0.145;0)";
    const sql = expressionToSql(expr);
    expect(sql).not.toBeNull();
    expect(sql).toContain("México");
    expect(sql).toContain("Panamá");
    expect(sql).toContain("CASE");
  });

  it("rechaza caracteres no permitidos fuera de literales enmascarados", () => {
    expect(expressionToSql("cola`backtick`")).toBeNull();
  });
});
