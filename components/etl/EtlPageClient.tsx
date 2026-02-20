"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Save, Undo2, Redo2, Settings, Users, Play, ListOrdered, GitBranch } from "lucide-react";
import ETLEditor, { Widget } from "@/components/etl/etl-editor";
import ConnectionsPalette from "@/components/connections/ConnectionsPalette";
import EtlTitleWithEdit from "@/components/etl/EtlTitleWithEdit";
import ETLLogPanel from "@/components/etl/etl-log-panel";
import ETLGuidedFlow, { type ETLGuidedFlowHandle } from "@/components/etl/ETLGuidedFlow";
import { ETLPreviewProvider } from "@/components/etl/ETLPreviewContext";
import { Connection as ServerConnection } from "@/components/connections/ConnectionsCard";

type Mode = "guided" | "advanced";

type Props = {
  etlId: string;
  title: string;
  connections: ServerConnection[];
  initialWidgets: Widget[] | null;
  initialZoom: number | undefined;
  initialGrid: number | undefined;
  initialEdges: Array<{ id: string; from: string; to: string }> | undefined;
  initialGuidedStep?: "conexion" | "origen" | "filtros" | "transformacion" | "destino" | "ejecutar";
};

export default function EtlPageClient({
  etlId,
  title,
  connections,
  initialWidgets,
  initialZoom,
  initialGrid,
  initialEdges,
  initialGuidedStep,
}: Props) {
  const [mode, setMode] = useState<Mode>("guided");
  const guidedFlowRef = useRef<ETLGuidedFlowHandle>(null);

  return (
    <div className="flex-1 w-full flex flex-col gap-4 p-6 box-border h-[calc(100vh-80px)]">
      <ETLPreviewProvider>
        {/* Toolbar */}
        <div
          className="w-full rounded-2xl px-4 py-3 flex items-center justify-between border border-[var(--platform-border)]"
          style={{ background: "var(--platform-surface)" }}
        >
          <div className="flex items-center gap-3" style={{ color: "var(--platform-fg-muted)" }}>
            <span className="text-xs font-medium uppercase tracking-wider">Admin</span>
            {/* Modo: Guiado | Avanzado */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1">
              <span className="text-xs font-medium uppercase tracking-wider hidden sm:inline" style={{ color: "var(--platform-fg-muted)" }}>Modo</span>
              <div className="flex items-center rounded-xl border p-0.5" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }} role="tablist" aria-label="Modo del editor">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "guided"}
                  aria-label="Modo guiado: pasos ordenados"
                  onClick={() => setMode("guided")}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    background: mode === "guided" ? "var(--platform-accent)" : "transparent",
                    color: mode === "guided" ? "var(--platform-bg)" : "var(--platform-fg-muted)",
                  }}
                >
                  <ListOrdered className="h-4 w-4" /> Guiado
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "advanced"}
                  aria-label="Editor avanzado: canvas con nodos"
                  onClick={() => setMode("advanced")}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    background: mode === "advanced" ? "var(--platform-accent)" : "transparent",
                    color: mode === "advanced" ? "var(--platform-bg)" : "var(--platform-fg-muted)",
                  }}
                >
                  <GitBranch className="h-4 w-4" /> Avanzado
                </button>
              </div>
            </div>
            {(mode === "guided" || mode === "advanced") && (
              <div className="flex items-center gap-1" role="toolbar" aria-label="Acciones del ETL">
                <button type="button" className="p-2 rounded-lg hover:bg-[var(--platform-surface-hover)] transition-colors" title="Guardar" aria-label="Guardar">
                  <Save className="h-4 w-4 opacity-70" style={{ color: "var(--platform-fg-muted)" }} />
                </button>
                <button type="button" className="p-2 rounded-lg hover:bg-[var(--platform-surface-hover)] transition-colors" title="Deshacer" aria-label="Deshacer">
                  <Undo2 className="h-4 w-4 opacity-70" style={{ color: "var(--platform-fg-muted)" }} />
                </button>
                <button type="button" className="p-2 rounded-lg hover:bg-[var(--platform-surface-hover)] transition-colors" title="Rehacer" aria-label="Rehacer">
                  <Redo2 className="h-4 w-4 opacity-70" style={{ color: "var(--platform-fg-muted)" }} />
                </button>
                <button type="button" className="p-2 rounded-lg hover:bg-[var(--platform-surface-hover)] transition-colors" title="Configuración" aria-label="Configuración">
                  <Settings className="h-4 w-4 opacity-70" style={{ color: "var(--platform-fg-muted)" }} />
                </button>
              </div>
            )}
          </div>
          <EtlTitleWithEdit etlId={etlId} initialTitle={title} />
          <div className="flex items-center gap-3">
            <span className="text-sm flex items-center gap-2" style={{ color: "var(--platform-fg-muted)" }}>
              <Users className="h-4 w-4" /> Admin
            </span>
            {(mode === "guided" || mode === "advanced") && (
              <Button
                className="rounded-full h-9 px-5 text-sm font-medium border-0"
                style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                onClick={mode === "guided" ? () => guidedFlowRef.current?.goToEjecutar() : undefined}
                title={mode === "guided" ? "Ir al paso Ejecutar" : "Ejecutar ETL"}
                aria-label={mode === "guided" ? "Ir al paso Ejecutar" : "Ejecutar ETL"}
              >
                <Play className="h-4 w-4 mr-2" /> Ejecutar
              </Button>
            )}
            <button
              className="h-9 w-9 rounded-full flex items-center justify-center border border-[var(--platform-border)] hover:bg-[var(--platform-surface-hover)]"
              style={{ background: "var(--platform-surface)" }}
            >
              <Settings className="h-4 w-4" style={{ color: "var(--platform-fg-muted)" }} />
            </button>
          </div>
        </div>

        {/* Content: Modo guiado (pasos) o Editor avanzado (canvas) */}
        <div
          className="flex-1 overflow-hidden relative rounded-2xl border min-h-0 flex flex-col"
          style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}
        >
          {mode === "guided" ? (
            <ETLGuidedFlow ref={guidedFlowRef} etlId={etlId} connections={connections} initialStep={initialGuidedStep} />
          ) : (
            <ETLEditor
              customLeftPanel={<ConnectionsPalette connections={connections} />}
              customBottomPanel={<ETLLogPanel />}
              etlId={etlId}
              etlTitle={title}
              initialWidgets={initialWidgets}
              initialZoom={initialZoom}
              initialGrid={initialGrid}
              initialEdges={initialEdges}
              availableConnections={connections}
            />
          )}
        </div>
      </ETLPreviewProvider>
    </div>
  );
}
