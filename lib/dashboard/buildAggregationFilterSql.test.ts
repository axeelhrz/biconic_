import { describe, expect, it } from "vitest";
import {
  buildAggregationFilterSqlClause,
  escapeSqlLikePattern,
  filterValueLooksNumeric,
  normalizeAggregationFilterOperator,
  parseFilterNumericValue,
} from "@/lib/dashboard/buildAggregationFilterSql";

describe("buildAggregationFilterSql", () => {
  const col = `"medio"`;

  it("normalizes Spanish / alias operators", () => {
    expect(normalizeAggregationFilterOperator("DISTINTO")).toBe("!=");
    expect(normalizeAggregationFilterOperator("Contiene")).toBe("CONTAINS");
    expect(normalizeAggregationFilterOperator("NO CONTIENE")).toBe("NOT_CONTAINS");
    expect(normalizeAggregationFilterOperator("!=")).toBe("!=");
  });

  it("builds equality and inequality", () => {
    expect(
      buildAggregationFilterSqlClause({ field: "medio", operator: "=", value: "IG" }, { fieldExpression: col })
    ).toContain("::text = 'IG'");
    expect(
      buildAggregationFilterSqlClause({ field: "medio", operator: "!=", value: "IG" }, { fieldExpression: col })
    ).toContain("IS DISTINCT FROM 'IG'");
  });

  it("builds numeric comparisons with safe cast", () => {
    const sql = buildAggregationFilterSqlClause(
      { field: "reach", operator: ">", value: "100" },
      { fieldExpression: `"reach"` }
    );
    expect(sql).toContain("::numeric");
    expect(sql).toContain("> 100");
    expect(
      buildAggregationFilterSqlClause(
        { field: "reach", operator: ">=", value: 50 },
        { fieldExpression: `"reach"` }
      )
    ).toContain(">= 50");
    expect(
      buildAggregationFilterSqlClause(
        { field: "reach", operator: "<=", value: "9,5" },
        { fieldExpression: `"reach"` }
      )
    ).toContain("<= 9.5");
  });

  it("builds contains / not contains", () => {
    const contains = buildAggregationFilterSqlClause(
      { field: "medio", operator: "CONTAINS", value: "gram" },
      { fieldExpression: col }
    );
    expect(contains).toMatch(/ILIKE '%gram%'/);
    const notContains = buildAggregationFilterSqlClause(
      { field: "medio", operator: "NOT_CONTAINS", value: "gram" },
      { fieldExpression: col }
    );
    expect(notContains).toMatch(/NOT ILIKE '%gram%'/);
  });

  it("escapes like wildcards in user input", () => {
    expect(escapeSqlLikePattern("100%_x")).toBe("100\\%\\_x");
    const sql = buildAggregationFilterSqlClause(
      { field: "medio", operator: "CONTAINS", value: "a%b" },
      { fieldExpression: col }
    );
    expect(sql).toContain("ESCAPE");
    expect(sql).toContain("%a\\%b%");
  });

  it("detects numeric-looking values", () => {
    expect(filterValueLooksNumeric("12.5")).toBe(true);
    expect(filterValueLooksNumeric("12,5")).toBe(true);
    expect(filterValueLooksNumeric("001")).toBe(false);
    expect(parseFilterNumericValue("12,5")).toBe(12.5);
  });
});
