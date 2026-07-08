"use client";

import type { ComparativeRelationValidation } from "@/lib/dataset/comparativeRelation";

type Props = {
  validation?: ComparativeRelationValidation;
};

export function ComparativeRelationValidationPanel({ validation }: Props) {
  if (!validation) {
    return (
      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
        Ejecutá la validación para verificar duplicados y cobertura de datos.
      </div>
    );
  }

  const isBlocked = validation.status === "blocked";
  const isWarning = validation.status === "warning";

  return (
    <div
      className="rounded-lg border p-4 space-y-2 text-sm"
      style={{
        borderColor: isBlocked ? "var(--platform-error, #dc2626)" : isWarning ? "#d97706" : "var(--platform-border)",
        background: isBlocked ? "rgba(220,38,38,0.06)" : isWarning ? "rgba(217,119,6,0.06)" : "var(--platform-bg)",
      }}
    >
      {validation.duplicates && validation.duplicates.count > 0 && (
        <p style={{ color: "var(--platform-error, #dc2626)" }}>
          Duplicados en dataset comparativo: {validation.duplicates.count} grupo(s) con claves repetidas.
          {validation.duplicates.sampleKeys?.length ? (
            <span className="block text-xs mt-1">Ejemplos: {validation.duplicates.sampleKeys.join("; ")}</span>
          ) : null}
        </p>
      )}
      {validation.baseWithoutMatch && validation.baseWithoutMatch.count > 0 && (
        <p style={{ color: "#d97706" }}>
          Advertencia: combinaciones del dataset base sin valor comparativo (aprox. {validation.baseWithoutMatch.count}).
        </p>
      )}
      {validation.comparativeWithoutBase && validation.comparativeWithoutBase.count > 0 && (
        <p style={{ color: "#d97706" }}>
          Advertencia: valores comparativos sin registros en el dataset base (aprox. {validation.comparativeWithoutBase.count}).
        </p>
      )}
      {validation.status === "ok" && (
        <p style={{ color: "var(--platform-accent)" }}>✓ Relación validada sin problemas.</p>
      )}
    </div>
  );
}
