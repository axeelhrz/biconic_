"use client";

import Link from "next/link";
import { BarChart2, ArrowRight, Plus } from "lucide-react";

type StudioEmptyStateProps = {
  /** Abre el modal para elegir métricas ya creadas */
  onAddMetrics: () => void;
  /** Si el dashboard tiene ETL vinculado, se muestra el enlace a métricas del ETL */
  etlId?: string | null;
};

export function StudioEmptyState({ onAddMetrics, etlId }: StudioEmptyStateProps) {
  return (
    <div className="studio-empty flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <h2 className="studio-empty-headline">
        {etlId ? "Agregá métricas al dashboard" : "Agregá métricas"}
      </h2>
      <p className="studio-empty-sub text-center max-w-md mx-auto mb-8">
        {etlId
          ? "Elegí métricas ya creadas para este ETL o creá nuevas en la página de métricas."
          : "Añadí una fuente de datos al dashboard para poder agregar métricas."}
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={onAddMetrics}
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold transition-all hover:opacity-90"
          style={{ background: "var(--studio-accent)", color: "var(--studio-accent-fg)" }}
        >
          <Plus className="h-5 w-5" />
          Agregar métricas
        </button>
        {etlId && (
          <Link
            href={`/admin/etl/${etlId}/metrics`}
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold border transition-all hover:opacity-90"
            style={{ borderColor: "var(--studio-border)", color: "var(--studio-accent)" }}
          >
            <BarChart2 className="h-5 w-5" />
            Ir a métricas del ETL
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
