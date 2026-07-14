import { describe, expect, it } from "vitest";
import {
  comparativeOutputColumns,
  deriveComparisonLevel,
  detectComparativeValueType,
  filterComparativeRelationFields,
  granularityRank,
  inferComparativeDateTransform,
  isAnalysisFinerThanComparisonLevel,
  normalizeComparativeColumnRef,
  normalizeComparativeFieldMappings,
  parseComparativeRelation,
  resolveActiveComparativeMappings,
  sqlDateTruncExpr,
} from "@/lib/dataset/comparativeRelation";
import { formatMonthYearEnLabel, parseMonthYearEnLabel } from "@/lib/dashboard/dateFormatting";
import { normalizeAggregationCompare } from "@/lib/dashboard/compareSpec";
import { validateComparativeCompare } from "@/lib/dashboard/validateComparativeCompare";
import {
  applyComparativeRelationToRows,
  buildComparativeAggregateSql,
} from "@/lib/dashboard/applyComparativeRelation";

describe("comparativeRelation", () => {
  it("derives comparison level from mappings", () => {
    expect(
      deriveComparisonLevel([
        { id: "1", comparativeColumn: "mes", baseColumn: "fecha", baseDateTransform: "month" },
        { id: "2", comparativeColumn: "region", baseColumn: "region" },
      ])
    ).toEqual(["fecha", "region"]);
  });

  it("detects percent columns by name", () => {
    expect(detectComparativeValueType("porcentaje_cumplimiento")).toBe("percent");
    expect(detectComparativeValueType("importe_total")).toBe("absolute");
  });

  it("filters legacy primary_* columns when real column exists", () => {
    expect(
      filterComparativeRelationFields([
        "primary_mes_y_a_o",
        "mes_y_a_o",
        "primary_zona",
        "zona",
        "provincia",
      ])
    ).toEqual(["mes_y_a_o", "zona", "provincia"]);
  });

  it("normalizes comparative field mappings away from empty primary_* columns", () => {
    const fields = ["mes_y_a_o", "zona", "provincia", "primary_zona"];
    expect(normalizeComparativeColumnRef("primary_zona", fields)).toBe("zona");
    expect(
      normalizeComparativeFieldMappings(
        [
          { id: "1", comparativeColumn: "mes_y_a_o", baseColumn: "fecha" },
          { id: "2", comparativeColumn: "primary_zona", baseColumn: "zona" },
          { id: "3", comparativeColumn: "provincia", baseColumn: "provincia" },
        ],
        fields
      )
    ).toEqual([
      { id: "1", comparativeColumn: "mes_y_a_o", baseColumn: "fecha", baseDateTransform: "monthYear" },
      { id: "2", comparativeColumn: "zona", baseColumn: "zona" },
      { id: "3", comparativeColumn: "provincia", baseColumn: "provincia" },
    ]);
  });

  it("auto-upgrades month transform to monthYear for mes_y_a_o columns", () => {
    const fields = ["mes_y_a_o", "zona", "provincia"];
    expect(
      normalizeComparativeFieldMappings(
        [{ id: "1", comparativeColumn: "mes_y_a_o", baseColumn: "fecha", baseDateTransform: "month" }],
        fields
      )
    ).toEqual([
      { id: "1", comparativeColumn: "mes_y_a_o", baseColumn: "fecha", baseDateTransform: "monthYear" },
    ]);
  });

  it("parses comparative relation from config", () => {
    const rel = parseComparativeRelation({
      id: "r1",
      name: "Presupuesto",
      comparativeDatasetId: "ds-2",
      fieldMappings: [{ id: "m1", comparativeColumn: "mes", baseColumn: "fecha" }],
      comparativeFields: [{ column: "meta", valueType: "absolute" }],
    });
    expect(rel?.comparisonLevel).toEqual(["fecha"]);
  });

  it("blocks finer analysis granularity than comparison level", () => {
    const blocked = isAnalysisFinerThanComparisonLevel({
      analysisDimensions: ["fecha"],
      analysisDateGranularity: "day",
      comparisonLevel: ["fecha"],
      fieldMappings: [
        { id: "m1", comparativeColumn: "mes", baseColumn: "fecha", baseDateTransform: "month" },
      ],
      timeColumn: "fecha",
    });
    expect(blocked).toBe(true);
    expect(granularityRank("day")).toBeLessThan(granularityRank("month"));
  });

  it("infers monthYear transform for mes_y_a_o columns", () => {
    expect(inferComparativeDateTransform("mes_y_a_o")).toBe("monthYear");
    expect(inferComparativeDateTransform("provincia")).toBeUndefined();
  });

  it("formats monthYear SQL expression for Mon-YYYY keys", () => {
    expect(sqlDateTruncExpr('"fecha"', "monthYear")).toContain("Sep");
    expect(sqlDateTruncExpr('"fecha"', "monthYear")).toContain("ARRAY");
  });
});

describe("compareSpec comparative", () => {
  it("normalizes comparative compare spec", () => {
    const spec = normalizeAggregationCompare({
      compare: {
        kind: "comparative",
        relationId: "r1",
        metricAlias: "ventas",
        comparativeField: "meta",
      },
    });
    expect(spec).toEqual({
      kind: "comparative",
      relationId: "r1",
      metricAlias: "ventas",
      comparativeField: "meta",
    });
  });
});

describe("validateComparativeCompare", () => {
  const relation = {
    id: "r1",
    name: "Presupuesto",
    comparativeDatasetId: "ds-2",
    fieldMappings: [{ id: "m1", comparativeColumn: "mes", baseColumn: "fecha", baseDateTransform: "month" }],
    comparisonLevel: ["fecha"],
    comparativeFields: [{ column: "meta", valueType: "absolute" as const }],
  };

  it("blocks absolute metric vs percent field", () => {
    const result = validateComparativeCompare({
      compare: { kind: "comparative", relationId: "r1", metricAlias: "ventas", comparativeField: "meta" },
      relation: { ...relation, comparativeFields: [{ column: "meta", valueType: "percent" }] },
      metricValueType: "absolute",
      comparativeFieldValueType: "percent",
      analysisDimensions: ["fecha"],
      analysisDateGranularity: "month",
      timeColumn: "fecha",
    });
    expect(result.level).toBe("blocked");
  });
});

describe("applyComparativeRelationToRows", () => {
  it("joins base and comparative rows for absolute fields", () => {
    const relation = {
      id: "r1",
      name: "Presupuesto",
      comparativeDatasetId: "ds-2",
      fieldMappings: [{ id: "m1", comparativeColumn: "mes", baseColumn: "mes" }],
      comparisonLevel: ["mes"],
      comparativeFields: [{ column: "meta", valueType: "absolute" as const }],
    };
    const rows = applyComparativeRelationToRows({
      baseRows: [{ mes: "2024-01", ventas: 100 }],
      comparativeRows: [{ mes: "2024-01", meta: 80 }],
      relation,
      compareSpec: { kind: "comparative", relationId: "r1", metricAlias: "ventas", comparativeField: "meta" },
      metricAliases: ["ventas"],
    });
    expect(rows[0]?.ventas_valor_real).toBe(100);
    expect(rows[0]?.ventas_valor_comparativo).toBe(80);
    expect(rows[0]?.ventas_delta).toBe(20);
    expect(rows[0]?.ventas_cumplimiento).toBe(125);
  });

  it("generates percent output columns", () => {
    const cols = comparativeOutputColumns("tasa", "percent");
    expect(cols).toContain("tasa_diferencia_puntos_porcentuales");
  });

  it("joins rows when base date uses monthYear transform", () => {
    const relation = {
      id: "r1",
      name: "Objetivos",
      comparativeDatasetId: "ds-2",
      fieldMappings: [
        {
          id: "m1",
          comparativeColumn: "mes_y_a_o",
          baseColumn: "fecha",
          baseDateTransform: "monthYear" as const,
        },
      ],
      comparisonLevel: ["fecha"],
      comparativeFields: [{ column: "meta", valueType: "absolute" as const }],
    };
    const rows = applyComparativeRelationToRows({
      baseRows: [{ fecha: "2024-09-15", ventas: 100 }],
      comparativeRows: [{ mes_y_a_o: "Sep-2024", meta: 80 }],
      relation,
      compareSpec: { kind: "comparative", relationId: "r1", metricAlias: "ventas", comparativeField: "meta" },
      metricAliases: ["ventas"],
    });
    expect(rows[0]?.ventas_valor_comparativo).toBe(80);
  });

  it("compares against comparative total when analysis has no dimensions", () => {
    const relation = {
      id: "r1",
      name: "Objetivos",
      comparativeDatasetId: "ds-2",
      fieldMappings: [
        { id: "m1", comparativeColumn: "zona", baseColumn: "zona" },
        { id: "m2", comparativeColumn: "provincia", baseColumn: "provincia" },
      ],
      comparisonLevel: ["zona", "provincia"],
      comparativeFields: [{ column: "meta", valueType: "absolute" as const }],
    };
    const rows = applyComparativeRelationToRows({
      baseRows: [{ ventas: 1000 }],
      comparativeRows: [{ meta: 800 }],
      relation,
      compareSpec: { kind: "comparative", relationId: "r1", metricAlias: "ventas", comparativeField: "meta" },
      metricAliases: ["ventas"],
      activeMappings: [],
    });
    expect(rows[0]?.ventas_valor_comparativo).toBe(800);
    expect(rows[0]?.ventas_cumplimiento).toBe(125);
  });

  it("compares only by active analysis dimensions", () => {
    const relation = {
      id: "r1",
      name: "Objetivos",
      comparativeDatasetId: "ds-2",
      fieldMappings: [
        { id: "m1", comparativeColumn: "zona", baseColumn: "DESCRIPCION" },
        { id: "m2", comparativeColumn: "provincia", baseColumn: "NOMBRE" },
        {
          id: "m3",
          comparativeColumn: "mes_y_a_o",
          baseColumn: "FECHACOMPROBANTE",
          baseDateTransform: "monthYear" as const,
        },
      ],
      comparisonLevel: ["FECHACOMPROBANTE", "NOMBRE", "DESCRIPCION"],
      comparativeFields: [{ column: "meta", valueType: "absolute" as const }],
    };
    const active = resolveActiveComparativeMappings({
      fieldMappings: relation.fieldMappings,
      analysisDimensions: ["join_3_descripcion"],
    });
    expect(active).toHaveLength(1);
    expect(active[0]?.comparativeColumn).toBe("zona");

    const rows = applyComparativeRelationToRows({
      baseRows: [{ join_3_descripcion: "NORTE", ventas: 100 }],
      comparativeRows: [
        { zona: "NORTE", meta: 40 },
        { zona: "SUR", meta: 60 },
      ],
      relation,
      compareSpec: { kind: "comparative", relationId: "r1", metricAlias: "ventas", comparativeField: "meta" },
      metricAliases: ["ventas"],
      activeMappings: active,
    });
    expect(rows[0]?.ventas_valor_comparativo).toBe(40);
  });

  it("builds SELECT without leading whitespace for execute_sql", () => {
    const relation = {
      id: "r1",
      name: "Objetivos",
      comparativeDatasetId: "ds-2",
      fieldMappings: [{ id: "m1", comparativeColumn: "zona", baseColumn: "zona" }],
      comparisonLevel: ["zona"],
      comparativeFields: [{ column: "meta", valueType: "absolute" as const }],
    };
    const sql = buildComparativeAggregateSql({
      schema: "etl_output",
      tableName: "objetivos",
      relation,
      comparativeField: "meta",
      valueType: "absolute",
      activeMappings: relation.fieldMappings,
    });
    expect(sql.startsWith("SELECT ")).toBe(true);

    const totalSql = buildComparativeAggregateSql({
      schema: "etl_output",
      tableName: "objetivos",
      relation,
      comparativeField: "meta",
      valueType: "absolute",
      activeMappings: [],
    });
    expect(totalSql).toContain('SUM(');
    expect(totalSql).toContain('regexp_replace');
    expect(totalSql).toContain('"meta"');
    expect(totalSql).toContain('FROM "etl_output"."objetivos"');
    expect(totalSql.startsWith("SELECT ")).toBe(true);
  });
});

describe("monthYear formatting", () => {
  it("parses and formats Mon-YYYY labels", () => {
    expect(parseMonthYearEnLabel("Sep-2024")).toEqual({ year: 2024, month: 9 });
    expect(formatMonthYearEnLabel("Sep-2024")).toBe("Sep-2024");
    expect(formatMonthYearEnLabel("2024-09-15")).toBe("Sep-2024");
  });
});
