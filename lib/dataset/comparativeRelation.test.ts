import { describe, expect, it } from "vitest";
import {
  comparativeOutputColumns,
  deriveComparisonLevel,
  detectComparativeValueType,
  filterComparativeRelationFields,
  granularityRank,
  isAnalysisFinerThanComparisonLevel,
  normalizeComparativeColumnRef,
  normalizeComparativeFieldMappings,
  parseComparativeRelation,
} from "@/lib/dataset/comparativeRelation";
import { normalizeAggregationCompare } from "@/lib/dashboard/compareSpec";
import { validateComparativeCompare } from "@/lib/dashboard/validateComparativeCompare";
import { applyComparativeRelationToRows } from "@/lib/dashboard/applyComparativeRelation";

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
      { id: "1", comparativeColumn: "mes_y_a_o", baseColumn: "fecha" },
      { id: "2", comparativeColumn: "zona", baseColumn: "zona" },
      { id: "3", comparativeColumn: "provincia", baseColumn: "provincia" },
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
});
