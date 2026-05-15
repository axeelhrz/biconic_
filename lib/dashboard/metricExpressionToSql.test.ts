import { describe, it, expect } from "vitest";
import { expressionToSql, ifsYieldsOnlyTextLiterals } from "@/lib/dashboard/metricExpressionToSql";

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

  it("IFS solo con valores de texto genera CASE con comillas (tipo texto en SQL)", () => {
    const expr =
      'IFS(pais_medio="Argentina","NSAM",pais_medio="Brasil","NSAM",pais_medio="México","Mexico","NIBU")';
    const sql = expressionToSql(expr);
    expect(sql).not.toBeNull();
    expect(sql).toContain("'NSAM'");
    expect(sql).toContain("'Mexico'");
    expect(sql).toContain("'NIBU'");
    expect(ifsYieldsOnlyTextLiterals(expr)).toBe(true);
  });

  it("rechaza caracteres no permitidos fuera de literales enmascarados", () => {
    expect(expressionToSql("cola`backtick`")).toBeNull();
  });
});

describe("ifsYieldsOnlyTextLiterals", () => {
  it("detecta IFS cuyas ramas son solo strings entre comillas", () => {
    expect(ifsYieldsOnlyTextLiterals('IFS(a=1,"x","y")')).toBe(true);
  });

  it("no aplica si algún valor es numérico", () => {
    expect(ifsYieldsOnlyTextLiterals("IFS(a;1;b;2;0)")).toBe(false);
  });

  it("no aplica si hay texto fuera de la llamada IFS", () => {
    expect(ifsYieldsOnlyTextLiterals('IFS(a;"x")+1')).toBe(false);
  });
});
