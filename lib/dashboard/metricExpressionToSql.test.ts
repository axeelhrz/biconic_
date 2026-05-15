import { describe, it, expect } from "vitest";
import { coerceArithmeticOperandsToNumeric } from "@/lib/dashboard/coerceNumericSqlExpr";
import {
  coerceAggFuncForTextOnlyIFS,
  expressionToSql,
  ifsYieldsOnlyTextLiterals,
} from "@/lib/dashboard/metricExpressionToSql";

function countSqlKeywords(sql: string, kw: string): number {
  const re = new RegExp(`\\b${kw}\\b`, "gi");
  return (sql.match(re) ?? []).length;
}

describe("expressionToSql", () => {
  it("IF con separador ; y coerce numérico: CASE/END balanceados (regresión error cerca de END)", () => {
    const expr = "IF(codigoarticulo=999999;0;preciocompra)";
    const sql = expressionToSql(expr);
    expect(sql).not.toBeNull();
    expect(sql).toBe('(CASE WHEN "codigoarticulo"=\'999999\' THEN 0 ELSE "preciocompra" END)');
    const coerced = coerceArithmeticOperandsToNumeric(sql!);
    expect(countSqlKeywords(coerced, "CASE")).toBe(countSqlKeywords(coerced, "END"));
    expect(coerced).toMatch(/ELSE[\s\S]+END\s*$/);
  });

  it("IF con comas: mismo balance CASE/END tras coerce", () => {
    const sql = expressionToSql("IF(codigoarticulo=999999,0,preciocompra)");
    expect(sql).not.toBeNull();
    const coerced = coerceArithmeticOperandsToNumeric(sql!);
    expect(countSqlKeywords(coerced, "CASE")).toBe(countSqlKeywords(coerced, "END"));
  });
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

  it("comparación columna = número: literal entre comillas para columnas text en PG", () => {
    expect(expressionToSql("codigoarticulo=999999")).toBe(`"codigoarticulo"='999999'`);
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

describe("coerceAggFuncForTextOnlyIFS", () => {
  it("convierte SUM y AVG en MAX para IFS solo texto (comas)", () => {
    const expr =
      'IFS(actividad="Grandes Supermercados","Grandes Supermercados",actividad="Distribuidor","Distribuidor","Preventa")';
    expect(coerceAggFuncForTextOnlyIFS("SUM", expr)).toBe("MAX");
    expect(coerceAggFuncForTextOnlyIFS("AVG", expr)).toBe("MAX");
    expect(coerceAggFuncForTextOnlyIFS("MAX", expr)).toBe("MAX");
    expect(coerceAggFuncForTextOnlyIFS("MIN", expr)).toBe("MIN");
  });

  it("convierte SUM en MAX con separador ; (estilo Excel)", () => {
    const expr =
      'IFS(actividad="Grandes Supermercados";"Grandes Supermercados";actividad="Distribuidor";"Distribuidor";"Preventa")';
    expect(coerceAggFuncForTextOnlyIFS("SUM", expr)).toBe("MAX");
  });

  it("no altera SUM si IFS mezcla números en ramas", () => {
    expect(coerceAggFuncForTextOnlyIFS("SUM", "IFS(a;1;b;2;0)")).toBe("SUM");
  });
});
