"use client";

import Link from "next/link";
import { TrendingUp, BarChart3, AlertTriangle, GitCompare, ScanSearch, LayoutDashboard, BarChart2, ArrowRight } from "lucide-react";

export type StudioIntent =
  | "detectar_cambios"
  | "comparar_periodos"
  | "señales_negativas"
  | "medir_impacto"
  | "explorar_distribucion";

export const STUDIO_INTENTS: { id: StudioIntent; label: string; description: string; icon: React.ElementType }[] = [
  { id: "detectar_cambios", label: "Detectar cambios relevantes", description: "Ver qué está cambiando en tus datos", icon: ScanSearch },
  { id: "comparar_periodos", label: "Comparar períodos", description: "Antes vs ahora, mes vs mes", icon: GitCompare },
  { id: "señales_negativas", label: "Identificar señales negativas", description: "Alertas y valores que bajan", icon: AlertTriangle },
  { id: "medir_impacto", label: "Medir impacto", description: "Efecto de una acción o campaña", icon: TrendingUp },
  { id: "explorar_distribucion", label: "Explorar distribución", description: "Cómo se reparten los valores", icon: BarChart3 },
];

type StudioEmptyStateProps = {
  onSelectIntent: (intent: StudioIntent | "blank") => void;
  /** Si el dashboard tiene ETL vinculado, priorizar el flujo métricas→dashboard */
  etlId?: string | null;
};

export function StudioEmptyState({ onSelectIntent, etlId }: StudioEmptyStateProps) {
  return (
    <div className="studio-empty flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      {etlId ? (
        <>
          <h2 className="studio-empty-headline">
            Creá métricas y sincronizá el dashboard
          </h2>
          <p className="studio-empty-sub text-center max-w-md mx-auto mb-8">
            Este dashboard se alimenta desde la página de métricas del ETL. Creá tus métricas allí, configurá agregaciones y sincronizá para verlas aquí.
          </p>
          <Link
            href={`/admin/etl/${etlId}/metrics`}
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-[var(--studio-accent-fg)] transition-all hover:opacity-90"
            style={{ background: "var(--studio-accent)" }}
          >
            <BarChart2 className="h-5 w-5" />
            Ir a métricas del ETL
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-8 text-sm text-[var(--studio-fg-muted)]">
            O añadí una métrica manualmente aquí
          </p>
        </>
      ) : (
        <h2 className="studio-empty-headline">
          ¿Qué querés entender hoy?
        </h2>
      )}
      {!etlId && (
        <p className="studio-empty-sub text-center">
          Empezá por una intención o creá una métrica vacía y configurá agregaciones, acumulados y comparaciones.
        </p>
      )}
      <div className={etlId ? "studio-intents mt-8 max-w-xl" : "studio-intents"}>
        {STUDIO_INTENTS.map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className="studio-intent-card group w-full text-left"
              onClick={() => onSelectIntent(item.id)}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className="studio-intent-icon">
                <Icon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="studio-intent-label block">{item.label}</span>
                <span className="studio-intent-desc block">{item.description}</span>
              </div>
            </button>
          );
        })}
        <button
          type="button"
          className="studio-intent-card group w-full text-left border-dashed"
          onClick={() => onSelectIntent("blank")}
        >
          <span className="studio-intent-icon">
            <LayoutDashboard className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="studio-intent-label block">Métrica vacía</span>
            <span className="studio-intent-desc block">Empezar desde cero: definí dimensión, métricas, condiciones, acumulados y comparaciones</span>
          </div>
        </button>
      </div>
    </div>
  );
}
