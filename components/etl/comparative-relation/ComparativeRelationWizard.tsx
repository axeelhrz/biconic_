"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  type ComparativeFieldMapping,
  type ComparativeMeasureField,
  type ComparativeRelation,
  type ComparativeRelationValidation,
  type DateTransform,
  deriveComparisonLevel,
  detectComparativeValueType,
  filterComparativeRelationFields,
  isComparativeMeasureCandidate,
  normalizeComparativeFieldMappings,
  parseComparativeRelation,
} from "@/lib/dataset/comparativeRelation";
import { ComparativeRelationMappingTable } from "./ComparativeRelationMappingTable";
import { ComparativeRelationValidationPanel } from "./ComparativeRelationValidationPanel";

export type DatasetListItem = {
  id: string;
  etl_id: string;
  name: string | null;
  etl_title?: string | null;
};

type ComparativeRelationWizardProps = {
  currentDatasetId: string | null;
  baseFields: string[];
  baseDateFields: string[];
  formatFieldLabel: (field: string) => string;
  relations: ComparativeRelation[];
  onRelationsChange: (relations: ComparativeRelation[]) => void;
  onCanAdvanceChange?: (canAdvance: boolean) => void;
};

const DATE_TRANSFORM_OPTIONS: { value: DateTransform; label: string }[] = [
  { value: "none", label: "Sin transformación" },
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "monthYear", label: "Mes-Año" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Año" },
];

export function ComparativeRelationWizard({
  currentDatasetId,
  baseFields,
  baseDateFields,
  formatFieldLabel,
  relations,
  onRelationsChange,
  onCanAdvanceChange,
}: ComparativeRelationWizardProps) {
  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(relations[0]?.id ?? null);
  const [subStep, setSubStep] = useState(0);
  const [compFields, setCompFields] = useState<string[]>([]);
  const [compNumericFields, setCompNumericFields] = useState<string[]>([]);
  const [compFieldsLoading, setCompFieldsLoading] = useState(false);
  const [validating, setValidating] = useState(false);

  const editing = useMemo(
    () => relations.find((r) => r.id === editingId) ?? null,
    [relations, editingId]
  );

  useEffect(() => {
    setDatasetsLoading(true);
    fetch("/api/admin/datasets")
      .then((r) => r.json())
      .then((json) => {
        const list = (json?.data?.datasets ?? []) as DatasetListItem[];
        setDatasets(
          list.filter((d) => !currentDatasetId || String(d.id) !== String(currentDatasetId))
        );
      })
      .catch(() => toast.error("No se pudieron cargar los datasets."))
      .finally(() => setDatasetsLoading(false));
  }, [currentDatasetId]);

  const loadComparativeFields = useCallback(async (datasetId: string, etlId: string) => {
    setCompFieldsLoading(true);
    try {
      const res = await fetch(`/api/etl/${etlId}/metrics-data?datasetId=${encodeURIComponent(datasetId)}`);
      const json = await res.json();
      const fields: string[] = json?.data?.fields?.all ?? [];
      const numeric: string[] = json?.data?.fields?.numeric ?? [];
      const filtered = filterComparativeRelationFields(fields);
      setCompFields(filtered);
      setCompNumericFields(
        filterComparativeRelationFields(numeric.length > 0 ? numeric : fields)
      );
    } catch {
      setCompFields([]);
      setCompNumericFields([]);
    } finally {
      setCompFieldsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (editing?.comparativeDatasetId && editing.comparativeDatasetId) {
      const ds = datasets.find((d) => d.id === editing.comparativeDatasetId);
      if (ds?.etl_id) loadComparativeFields(editing.comparativeDatasetId, ds.etl_id);
    }
  }, [editing?.comparativeDatasetId, datasets, loadComparativeFields]);

  const updateEditing = (patch: Partial<ComparativeRelation>) => {
    if (!editing) return;
    const next = relations.map((r) =>
      r.id === editing.id
        ? {
            ...r,
            ...patch,
            comparisonLevel: patch.fieldMappings
              ? deriveComparisonLevel(patch.fieldMappings)
              : r.comparisonLevel,
          }
        : r
    );
    onRelationsChange(next);
  };

  useEffect(() => {
    if (!editing || compFields.length === 0 || editing.fieldMappings.length === 0) return;
    const normalized = normalizeComparativeFieldMappings(editing.fieldMappings, compFields);
    const changed = normalized.some(
      (m, i) => m.comparativeColumn !== editing.fieldMappings[i]?.comparativeColumn
    );
    if (!changed) return;
    const next = relations.map((r) =>
      r.id === editing.id
        ? {
            ...r,
            fieldMappings: normalized,
            comparisonLevel: deriveComparisonLevel(normalized),
            validation: undefined,
          }
        : r
    );
    onRelationsChange(next);
  }, [compFields, editing?.id, editing?.fieldMappings, relations, onRelationsChange]);

  const addRelation = () => {
    const id = `crel-${Date.now()}`;
    const newRel: ComparativeRelation = {
      id,
      name: "Nueva relación",
      comparativeDatasetId: "",
      fieldMappings: [],
      comparisonLevel: [],
      comparativeFields: [],
    };
    onRelationsChange([...relations, newRel]);
    setEditingId(id);
    setSubStep(0);
  };

  const removeRelation = (id: string) => {
    const next = relations.filter((r) => r.id !== id);
    onRelationsChange(next);
    if (editingId === id) {
      setEditingId(next[0]?.id ?? null);
      setSubStep(0);
    }
  };

  const canValidate =
    editing != null &&
    editing.comparativeDatasetId &&
    editing.fieldMappings.length > 0 &&
    editing.comparativeFields.length > 0;

  const canAdvance =
    relations.length === 0 ||
    relations.every((r) => {
      if (!r.comparativeDatasetId) return true;
      if (r.fieldMappings.length === 0 || r.comparativeFields.length === 0) return false;
      if (r.validation?.status === "blocked") return false;
      return true;
    });

  useEffect(() => {
    onCanAdvanceChange?.(canAdvance);
  }, [canAdvance, onCanAdvanceChange]);

  const runValidation = async () => {
    if (!editing || !currentDatasetId) {
      toast.error("Guardá el dataset antes de validar la relación.");
      return;
    }
    if (!canValidate) {
      toast.error("Completá dataset comparativo, mapeo y campos comparativos.");
      return;
    }
    setValidating(true);
    try {
      const normalizedMappings = normalizeComparativeFieldMappings(
        editing.fieldMappings,
        compFields
      );
      if (
        normalizedMappings.some(
          (m, i) => m.comparativeColumn !== editing.fieldMappings[i]?.comparativeColumn
        )
      ) {
        updateEditing({ fieldMappings: normalizedMappings });
      }
      const res = await fetch("/api/dataset/comparative-relation/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseDatasetId: currentDatasetId,
          comparativeDatasetId: editing.comparativeDatasetId,
          fieldMappings: normalizedMappings,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error ?? "Error al validar");
        return;
      }
      const validation = json.data.validation as ComparativeRelationValidation;
      updateEditing({ validation });
      if (validation.status === "blocked") {
        const emptyMsg = validation.emptyKeyColumns?.message;
        toast.error(
          emptyMsg ?? "Validación bloqueada: hay duplicados en el dataset comparativo."
        );
      } else if (validation.status === "warning") {
        toast.warning("Relación válida con advertencias de cobertura.");
      } else {
        toast.success("Relación validada correctamente.");
      }
    } catch {
      toast.error("Error de red al validar.");
    } finally {
      setValidating(false);
    }
  };

  const toggleComparativeField = (column: string, checked: boolean) => {
    if (!editing) return;
    let next: ComparativeMeasureField[];
    if (checked) {
      const valueType = detectComparativeValueType(column);
      next = [...editing.comparativeFields, { column, valueType }];
    } else {
      next = editing.comparativeFields.filter((f) => f.column !== column);
    }
    updateEditing({ comparativeFields: next });
  };

  const setFieldValueType = (column: string, valueType: "absolute" | "percent") => {
    if (!editing) return;
    updateEditing({
      comparativeFields: editing.comparativeFields.map((f) =>
        f.column === column ? { ...f, valueType } : f
      ),
    });
  };

  const measureCandidates = compFields.filter((col) =>
    isComparativeMeasureCandidate({
      columnName: col,
      inferredType: compNumericFields.includes(col) ? "Número" : undefined,
    })
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {relations.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => {
              setEditingId(r.id);
              setSubStep(0);
            }}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{
              borderColor: editingId === r.id ? "var(--platform-accent)" : "var(--platform-border)",
              background: editingId === r.id ? "var(--platform-accent-dim)" : "var(--platform-bg)",
              color: "var(--platform-fg)",
            }}
          >
            {r.name}
            {r.validation?.status === "blocked" && " ⚠"}
            {r.validation?.status === "warning" && " ○"}
          </button>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addRelation} className="rounded-lg h-8">
          + Agregar relación
        </Button>
      </div>

      {!editing && relations.length === 0 && (
        <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
          Opcional: vinculá este dataset con tablas de objetivos, presupuesto o forecast.
        </p>
      )}

      {editing && (
        <>
          <div className="flex gap-2 text-xs mb-2">
            {["Dataset comparativo", "Mapeo", "Campos comparativos", "Validación"].map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setSubStep(i)}
                className="px-2 py-1 rounded"
                style={{
                  background: subStep === i ? "var(--platform-accent-dim)" : "transparent",
                  color: subStep === i ? "var(--platform-accent)" : "var(--platform-fg-muted)",
                }}
              >
                {i + 1}. {label}
              </button>
            ))}
          </div>

          {subStep === 0 && (
            <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--platform-border)" }}>
              <div>
                <Label className="text-sm">Nombre de la relación</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => updateEditing({ name: e.target.value })}
                  className="mt-1 h-9"
                  placeholder="Ej. Presupuesto 2026"
                />
              </div>
              <div>
                <Label className="text-sm">Dataset comparativo</Label>
                <select
                  className="mt-1 w-full h-9 rounded-lg border px-3 text-sm"
                  style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
                  value={editing.comparativeDatasetId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const ds = datasets.find((d) => d.id === id);
                    updateEditing({
                      comparativeDatasetId: id,
                      comparativeDatasetName: ds?.name ?? ds?.etl_title ?? undefined,
                      fieldMappings: [],
                      comparativeFields: [],
                      validation: undefined,
                    });
                  }}
                >
                  <option value="">{datasetsLoading ? "Cargando…" : "Elegir dataset"}</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name || d.etl_title || d.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-between pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => removeRelation(editing.id)}>
                  Eliminar relación
                </Button>
                <Button type="button" size="sm" onClick={() => setSubStep(1)} disabled={!editing.comparativeDatasetId}>
                  Siguiente: Mapeo
                </Button>
              </div>
            </div>
          )}

          {subStep === 1 && (
            <ComparativeRelationMappingTable
              baseFields={baseFields}
              baseDateFields={baseDateFields}
              comparativeFields={compFields}
              mappings={editing.fieldMappings}
              comparisonLevel={editing.comparisonLevel}
              formatFieldLabel={formatFieldLabel}
              dateTransformOptions={DATE_TRANSFORM_OPTIONS}
              loading={compFieldsLoading}
              onChange={(fieldMappings: ComparativeFieldMapping[]) => updateEditing({ fieldMappings, validation: undefined })}
              onBack={() => setSubStep(0)}
              onNext={() => setSubStep(2)}
            />
          )}

          {subStep === 2 && (
            <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--platform-border)" }}>
              <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                Seleccioná columnas numéricas del dataset comparativo para usar en análisis.
              </p>
              {compFieldsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {measureCandidates.map((col) => {
                    const selected = editing.comparativeFields.find((f) => f.column === col);
                    const detected = detectComparativeValueType(col);
                    return (
                      <div key={col} className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={!!selected}
                          onChange={(e) => toggleComparativeField(col, e.target.checked)}
                        />
                        <span style={{ color: "var(--platform-fg)" }}>{formatFieldLabel(col)}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--platform-surface)", color: "var(--platform-fg-muted)" }}>
                          {detected === "percent" ? "porcentaje" : "absoluto"}
                        </span>
                        {selected && (
                          <select
                            className="h-7 text-xs rounded border px-2"
                            value={selected.valueType}
                            onChange={(e) => setFieldValueType(col, e.target.value as "absolute" | "percent")}
                          >
                            <option value="absolute">Absoluto</option>
                            <option value="percent">Porcentaje</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-between pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSubStep(1)}>Anterior</Button>
                <Button type="button" size="sm" onClick={() => setSubStep(3)} disabled={editing.comparativeFields.length === 0}>
                  Siguiente: Validación
                </Button>
              </div>
            </div>
          )}

          {subStep === 3 && (
            <div className="space-y-3">
              <ComparativeRelationValidationPanel validation={editing.validation} />
              <div className="flex justify-between">
                <Button type="button" variant="outline" size="sm" onClick={() => setSubStep(2)}>Anterior</Button>
                <Button type="button" size="sm" onClick={runValidation} disabled={validating || !canValidate}>
                  {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {validating ? " Validando…" : "Validar relación"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
