"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ComparativeFieldMapping, DateTransform } from "@/lib/dataset/comparativeRelation";
import { deriveComparisonLevel, inferComparativeDateTransform } from "@/lib/dataset/comparativeRelation";

type Props = {
  baseFields: string[];
  baseDateFields: string[];
  comparativeFields: string[];
  mappings: ComparativeFieldMapping[];
  comparisonLevel: string[];
  formatFieldLabel: (field: string) => string;
  dateTransformOptions: { value: DateTransform; label: string }[];
  loading?: boolean;
  onChange: (mappings: ComparativeFieldMapping[]) => void;
  onBack: () => void;
  onNext: () => void;
};

export function ComparativeRelationMappingTable({
  baseFields,
  baseDateFields,
  comparativeFields,
  mappings,
  comparisonLevel,
  formatFieldLabel,
  dateTransformOptions,
  loading,
  onChange,
  onBack,
  onNext,
}: Props) {
  const addMapping = () => {
    onChange([
      ...mappings,
      {
        id: `map-${Date.now()}`,
        comparativeColumn: comparativeFields[0] ?? "",
        baseColumn: baseFields[0] ?? "",
        baseDateTransform: "none",
      },
    ]);
  };

  const withSuggestedDateTransform = (
    mapping: ComparativeFieldMapping,
    patch: Partial<ComparativeFieldMapping>
  ): ComparativeFieldMapping => {
    const next = { ...mapping, ...patch };
    const baseColumn = next.baseColumn;
    const comparativeColumn = next.comparativeColumn;
    const isDate = baseDateFields.includes(baseColumn);
    const suggested = isDate ? inferComparativeDateTransform(comparativeColumn) : undefined;
    const current = next.baseDateTransform ?? "none";

    if (
      suggested &&
      isDate &&
      (patch.comparativeColumn != null || patch.baseColumn != null) &&
      (current === "none" || current === "month")
    ) {
      return { ...next, baseDateTransform: suggested };
    }
    return next;
  };

  const updateMapping = (id: string, patch: Partial<ComparativeFieldMapping>) => {
    onChange(
      mappings.map((m) => (m.id === id ? withSuggestedDateTransform(m, patch) : m))
    );
  };

  const removeMapping = (id: string) => {
    onChange(mappings.filter((m) => m.id !== id));
  };

  const level = comparisonLevel.length > 0 ? comparisonLevel : deriveComparisonLevel(mappings);

  return (
    <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--platform-border)" }}>
      <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
        Mapeá campos del dataset comparativo con el dataset base. Para fechas, podés aplicar una transformación.
      </p>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>Cargando columnas…</p>
      ) : (
        <div className="space-y-2">
          {mappings.map((m) => {
            const isDate = baseDateFields.includes(m.baseColumn);
            return (
              <div key={m.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end border-b pb-2" style={{ borderColor: "var(--platform-border)" }}>
                <div>
                  <Label className="text-xs">Campo comparativo</Label>
                  <select
                    className="mt-1 w-full h-8 text-xs rounded border px-2"
                    style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
                    value={m.comparativeColumn}
                    onChange={(e) => updateMapping(m.id, { comparativeColumn: e.target.value })}
                  >
                    {comparativeFields.map((c) => (
                      <option key={c} value={c}>{formatFieldLabel(c)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Campo base</Label>
                  <select
                    className="mt-1 w-full h-8 text-xs rounded border px-2"
                    style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
                    value={m.baseColumn}
                    onChange={(e) => updateMapping(m.id, { baseColumn: e.target.value })}
                  >
                    {baseFields.map((c) => (
                      <option key={c} value={c}>{formatFieldLabel(c)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Transformación</Label>
                  <select
                    className="mt-1 w-full h-8 text-xs rounded border px-2"
                    style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
                    value={m.baseDateTransform ?? "none"}
                    onChange={(e) => updateMapping(m.id, { baseDateTransform: e.target.value as DateTransform })}
                    disabled={!isDate}
                  >
                    {dateTransformOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <Button type="button" variant="ghost" size="sm" className="text-red-600 h-8" onClick={() => removeMapping(m.id)}>
                  Quitar
                </Button>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" onClick={addMapping} disabled={!comparativeFields.length || !baseFields.length}>
            + Agregar mapeo
          </Button>
        </div>
      )}

      {level.length > 0 && (
        <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
          Nivel de comparación detectado: {level.map(formatFieldLabel).join(" + ")}
        </p>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>Anterior</Button>
        <Button type="button" size="sm" onClick={onNext} disabled={mappings.length === 0}>Siguiente</Button>
      </div>
    </div>
  );
}
