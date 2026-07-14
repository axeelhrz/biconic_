import type { CompareSpec } from "@/lib/dashboard/compareSpec";
import type { ComparativeRelation, ComparativeValueType } from "@/lib/dataset/comparativeRelation";
import { isAnalysisFinerThanComparisonLevel } from "@/lib/dataset/comparativeRelation";
import type { DateGranularity } from "@/lib/dashboard/dateFormatting";

export type ComparativeCompareValidationLevel = "ok" | "warning" | "blocked";

export type ComparativeCompareValidation = {
  level: ComparativeCompareValidationLevel;
  messages: string[];
};

export function detectMetricValueType(params: {
  metricFormat?: string;
  chartValueType?: string;
  metricFunc?: string;
}): ComparativeValueType {
  const fmt = String(params.chartValueType ?? params.metricFormat ?? "").toLowerCase();
  if (fmt === "percent" || fmt === "percentage" || fmt === "porcentaje") return "percent";
  if (params.metricFunc?.toUpperCase() === "AVG" && fmt === "percent") return "percent";
  return "absolute";
}

export function validateComparativeCompare(params: {
  compare: CompareSpec;
  relation: ComparativeRelation | null;
  metricValueType: ComparativeValueType;
  comparativeFieldValueType?: ComparativeValueType;
  analysisDimensions: string[];
  analysisDateGranularity?: DateGranularity;
  timeColumn?: string;
}): ComparativeCompareValidation {
  const messages: string[] = [];

  if (params.compare.kind !== "comparative") {
    return { level: "ok", messages };
  }

  const compare = params.compare;

  if (!params.relation) {
    return { level: "blocked", messages: ["La relación comparativa seleccionada no existe en el dataset base."] };
  }

  const field = params.relation.comparativeFields.find(
    (f) => f.column === compare.comparativeField
  );
  if (!field) {
    return {
      level: "blocked",
      messages: ["El campo comparativo no está definido en la relación seleccionada."],
    };
  }

  const compType = params.comparativeFieldValueType ?? field.valueType;
  const metricType = params.metricValueType;

  if (metricType === "percent" && compType === "absolute") {
    messages.push(
      "La métrica es porcentual pero el campo comparativo es absoluto; el cálculo puede ser incorrecto."
    );
    return { level: "blocked", messages };
  }

  if (metricType === "absolute" && compType === "percent") {
    messages.push(
      "La métrica es absoluta pero el campo comparativo es porcentual; el cálculo puede ser incorrecto."
    );
    return { level: "blocked", messages };
  }

  if (metricType !== compType) {
    messages.push("Tipos de métrica y campo comparativo potencialmente incompatibles.");
    return { level: "warning", messages };
  }

  const finer = isAnalysisFinerThanComparisonLevel({
    analysisDimensions: params.analysisDimensions,
    analysisDateGranularity: params.analysisDateGranularity,
    comparisonLevel: params.relation.comparisonLevel,
    fieldMappings: params.relation.fieldMappings,
    timeColumn: params.timeColumn,
  });

  if (finer) {
    return {
      level: "blocked",
      messages: [
        "Las dimensiones del análisis son más detalladas que el nivel de comparación definido en la relación.",
      ],
    };
  }

  return { level: "ok", messages };
}
