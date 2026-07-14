"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import type { CompareSpec } from "@/lib/dashboard/compareSpec";
import type { ComparativeRelation } from "@/lib/dataset/comparativeRelation";
import { comparativeOutputColumns } from "@/lib/dataset/comparativeRelation";
import {
  detectMetricValueType,
  validateComparativeCompare,
} from "@/lib/dashboard/validateComparativeCompare";
import type { DateGranularity } from "@/lib/dashboard/dateFormatting";

export type ComparativeRelationCompareFieldsProps = {
  variant: "studio" | "etl";
  compare: CompareSpec;
  setCompare: (next: CompareSpec) => void;
  relations: ComparativeRelation[];
  metricOptions: { alias: string; label: string; valueType?: "absolute" | "percent" }[];
  analysisDimensions: string[];
  analysisDateGranularity?: DateGranularity;
  timeColumn?: string;
  chartValueType?: string;
};

function fieldClass(variant: "studio" | "etl"): string {
  return variant === "etl" ? "w-full h-9 rounded-lg border px-3 text-sm" : "mt-0.5 w-full h-8 rounded border px-2 text-xs";
}

function etlSelectStyle(variant: "studio" | "etl") {
  return variant === "etl"
    ? ({ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" } as const)
    : undefined;
}

export function ComparativeRelationCompareFields({
  variant,
  compare,
  setCompare,
  relations,
  metricOptions,
  analysisDimensions,
  analysisDateGranularity,
  timeColumn,
  chartValueType,
}: ComparativeRelationCompareFieldsProps) {
  const compCompare = compare.kind === "comparative" ? compare : null;

  const selectedRelation = useMemo(
    () => relations.find((r) => r.id === compCompare?.relationId) ?? null,
    [relations, compCompare?.relationId]
  );

  const selectedField = selectedRelation?.comparativeFields.find(
    (f) => f.column === compCompare?.comparativeField
  );

  const validation = useMemo(() => {
    if (compare.kind !== "comparative") return null;
    const metricOpt = metricOptions.find((m) => m.alias === compare.metricAlias);
    return validateComparativeCompare({
      compare,
      relation: selectedRelation,
      metricValueType: metricOpt?.valueType ?? detectMetricValueType({ chartValueType }),
      comparativeFieldValueType: selectedField?.valueType,
      analysisDimensions,
      analysisDateGranularity,
      timeColumn,
    });
  }, [
    compare,
    selectedRelation,
    metricOptions,
    selectedField,
    analysisDimensions,
    analysisDateGranularity,
    timeColumn,
    chartValueType,
  ]);

  const previewColumns =
    compCompare && selectedField
      ? comparativeOutputColumns(compCompare.metricAlias, selectedField.valueType)
      : [];

  const update = (patch: Partial<Extract<CompareSpec, { kind: "comparative" }>>) => {
    if (compare.kind !== "comparative") return;
    setCompare({ ...compare, ...patch });
  };

  if (relations.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
        No hay relaciones comparativas definidas en el dataset base. Configuralas en Dataset → Relación Comparativa.
      </p>
    );
  }

  return (
    <div className={variant === "etl" ? "space-y-3" : "space-y-2"}>
      <div>
        <Label className={variant === "etl" ? "text-sm font-medium block" : "text-[11px]"} style={variant === "etl" ? { color: "var(--platform-fg-muted)" } : undefined}>
          Relación comparativa
        </Label>
        <select
          className={fieldClass(variant)}
          style={etlSelectStyle(variant)}
          value={compCompare?.relationId ?? ""}
          onChange={(e) => {
            const relationId = e.target.value;
            const rel = relations.find((r) => r.id === relationId);
            const firstField = rel?.comparativeFields[0]?.column ?? "";
            const metricAlias = metricOptions.length === 1 ? metricOptions[0]!.alias : compCompare?.metricAlias ?? "";
            setCompare({ kind: "comparative", relationId, metricAlias, comparativeField: firstField });
          }}
        >
          <option value="">Elegir relación</option>
          {relations.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {compCompare?.relationId && (
        <>
          <div>
            <Label className={variant === "etl" ? "text-sm font-medium block" : "text-[11px]"} style={variant === "etl" ? { color: "var(--platform-fg-muted)" } : undefined}>
              Métrica real
            </Label>
            <select
              className={fieldClass(variant)}
              style={etlSelectStyle(variant)}
              value={compCompare.metricAlias}
              onChange={(e) => update({ metricAlias: e.target.value })}
            >
              <option value="">Elegir métrica</option>
              {metricOptions.map((m) => (
                <option key={m.alias} value={m.alias}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label className={variant === "etl" ? "text-sm font-medium block" : "text-[11px]"} style={variant === "etl" ? { color: "var(--platform-fg-muted)" } : undefined}>
              Campo comparativo
            </Label>
            <select
              className={fieldClass(variant)}
              style={etlSelectStyle(variant)}
              value={compCompare.comparativeField}
              onChange={(e) => update({ comparativeField: e.target.value })}
            >
              <option value="">Elegir campo</option>
              {(selectedRelation?.comparativeFields ?? []).map((f) => (
                <option key={f.column} value={f.column}>
                  {f.label || f.column} ({f.valueType === "percent" ? "porcentaje" : "absoluto"})
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {validation && validation.messages.length > 0 && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{
            borderColor: validation.level === "blocked" ? "#dc2626" : "#d97706",
            color: validation.level === "blocked" ? "#dc2626" : "#d97706",
          }}
        >
          {validation.messages.map((msg, i) => (
            <p key={i}>{msg}</p>
          ))}
        </div>
      )}

      {previewColumns.length > 0 && (
        <div className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
          Columnas que se generarán: {previewColumns.join(", ")}
        </div>
      )}
    </div>
  );
}
