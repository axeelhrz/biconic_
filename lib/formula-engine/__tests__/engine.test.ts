import { describe, expect, it } from "vitest";
import {
  checkBalancedParens,
  expressionHasAggregation,
  expressionToSql,
  FormulaCycleError,
} from "@/lib/formula-engine";
import type { DerivedColumnRef } from "@/lib/formula-engine/types";

describe("expressionToSql", () => {
  it("traduce IF simple", () => {
    const sql = expressionToSql('IF(monto>0; monto; 0)', undefined);
    expect(sql).toBeTruthy();
    expect(sql!.toUpperCase()).toContain("CASE");
    expect(sql!.replace(/\s+/g, " ")).toContain("ELSE 0 END");
  });

  it("IF anidado (varios niveles)", () => {
    const inner = "IF(a>1; IF(b>2; 3; 4); 5)";
    const sql = expressionToSql(inner, undefined);
    expect(sql).toBeTruthy();
    expect((sql!.match(/CASE/gi) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("IFS con default", () => {
    const sql = expressionToSql('IFS(x<0; "neg"; x=0; "cero"; TRUE(); "pos")', undefined);
    expect(sql).toBeTruthy();
  });

  it("SUMIF y criterio con comillas", () => {
    const derived: Record<string, DerivedColumnRef> = {};
    const sql = expressionToSql('SUMIF(cantidad;">0"; total)', derived);
    expect(sql).toBeTruthy();
  });

  it("concatenación con & (Postgres)", () => {
    const sql = expressionToSql('nombre & " " & apellido', undefined);
    expect(sql).toBeTruthy();
    expect(sql).toMatch(/\|\|/);
  });

  it("columnas derivadas en cadena A→B→C", () => {
    const derived: Record<string, DerivedColumnRef> = {
      a: { name: "a", expression: "1", defaultAggregation: "SUM" },
      b: { name: "b", expression: "a+1", defaultAggregation: "SUM" },
      c: { name: "c", expression: "b*2", defaultAggregation: "SUM" },
    };
    const sql = expressionToSql("c", derived);
    expect(sql).toBeTruthy();
  });

  it("detecta ciclo A→B→A y lanza FormulaCycleError", () => {
    const derived: Record<string, DerivedColumnRef> = {
      a: { name: "a", expression: "b+1", defaultAggregation: "SUM" },
      b: { name: "b", expression: "a+1", defaultAggregation: "SUM" },
    };
    expect(() => expressionToSql("a", derived)).toThrow(FormulaCycleError);
  });

  it("paréntesis desbalanceados", () => {
    const err = checkBalancedParens("IF(1>0;1;0");
    expect(err).toBeTruthy();
  });
});

describe("expressionHasAggregation", () => {
  it("COUNTA se considera agregación", () => {
    expect(expressionHasAggregation("COUNTA(col)")).toBe(true);
  });

  it("IF por fila sin agregados", () => {
    expect(expressionHasAggregation("IF(x>0; x*2; 0)")).toBe(false);
  });
});
