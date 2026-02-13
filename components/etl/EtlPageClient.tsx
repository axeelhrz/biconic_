"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, Undo2, Redo2, Settings, Users, Play, ListOrdered, GitBranch } from "lucide-react";
import ETLEditor, { Widget } from "@/components/etl/etl-editor";
import ConnectionsPalette from "@/components/connections/ConnectionsPalette";
import EtlTitleWithEdit from "@/components/etl/EtlTitleWithEdit";
import ETLLogPanel from "@/components/etl/etl-log-panel";
import ETLGuidedFlow from "@/components/etl/ETLGuidedFlow";
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
  initialGuidedStep?: "origen" | "filtros" | "destino" | "ejecutar";
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
            <div className="flex items-center rounded-xl border p-0.5" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
              <button
                type="button"
                onClick={() => setMode("guided")}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  background: mode === "guided" ? "var(--platform-accent)" : "transparent",
                  color: mode === "guided" ? "var(--platform-bg)" : "var(--platform-fg-muted)",
                }}
              >
                <ListOrdered className="h-4 w-4" /> Modo guiado
              </button>
              <button
                type="button"
                onClick={() => setMode("advanced")}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  background: mode === "advanced" ? "var(--platform-accent)" : "transparent",
                  color: mode === "advanced" ? "var(--platform-bg)" : "var(--platform-fg-muted)",
                }}
              >
                <GitBranch className="h-4 w-4" /> Editor avanzado
              </button>
            </div>
            {mode === "advanced" && (
              <>
                <Save className="h-4 w-4 opacity-70" />
                <Undo2 className="h-4 w-4 opacity-70" />
                <Redo2 className="h-4 w-4 opacity-70" />
                <Settings className="h-4 w-4 opacity-70" />
              </>
            )}
          </div>
          <EtlTitleWithEdit etlId={etlId} initialTitle={title} />
          <div className="flex items-center gap-3">
            <span className="text-sm flex items-center gap-2" style={{ color: "var(--platform-fg-muted)" }}>
              <Users className="h-4 w-4" /> Admin
            </span>
            {mode === "advanced" && (
              <Button
                className="rounded-full h-9 px-5 text-sm font-medium border-0"
                style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
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
            <ETLGuidedFlow etlId={etlId} connections={connections} initialStep={initialGuidedStep} />
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
