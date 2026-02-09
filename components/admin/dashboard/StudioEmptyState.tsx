"use client";

import { TrendingUp, BarChart3, AlertTriangle, GitCompare, ScanSearch, LayoutDashboard } from "lucide-react";

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
};

export function StudioEmptyState({ onSelectIntent }: StudioEmptyStateProps) {
  return (
    <div className="studio-empty flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <h2 className="studio-empty-headline">
        ¿Qué querés entender hoy?
      </h2>
      <p className="studio-empty-sub text-center">
        Empezá por una intención o creá una métrica vacía y configurá agregaciones, acumulados y comparaciones.
      </p>
      <div className="studio-intents">
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
