"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Save, Undo2, Redo2, Settings, Users, Play } from "lucide-react";
import EtlTitleWithEdit from "@/components/etl/EtlTitleWithEdit";
import ETLGuidedFlow, { type ETLGuidedFlowHandle } from "@/components/etl/ETLGuidedFlow";
import { ETLPreviewProvider } from "@/components/etl/ETLPreviewContext";
import { Connection as ServerConnection } from "@/components/connections/ConnectionsCard";

type Props = {
  etlId: string;
  title: string;
  connections: ServerConnection[];
  initialWidgets: unknown;
  initialZoom: number | undefined;
  initialGrid: number | undefined;
  initialEdges: Array<{ id: string; from: string; to: string }> | undefined;
  initialGuidedStep?: "conexion" | "origen" | "filtros" | "transformacion" | "destino" | "ejecutar";
};

export default function EtlPageClient({
  etlId,
  title,
  connections,
  initialGuidedStep,
}: Props) {
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
          </div>
          <EtlTitleWithEdit etlId={etlId} initialTitle={title} />
          <div className="flex items-center gap-3">
            <span className="text-sm flex items-center gap-2" style={{ color: "var(--platform-fg-muted)" }}>
              <Users className="h-4 w-4" /> Admin
            </span>
            <Button
              className="rounded-full h-9 px-5 text-sm font-medium border-0"
              style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
              onClick={() => guidedFlowRef.current?.goToEjecutar()}
              title="Ir al paso Ejecutar"
              aria-label="Ir al paso Ejecutar"
            >
              <Play className="h-4 w-4 mr-2" /> Ejecutar
            </Button>
            <button
              className="h-9 w-9 rounded-full flex items-center justify-center border border-[var(--platform-border)] hover:bg-[var(--platform-surface-hover)]"
              style={{ background: "var(--platform-surface)" }}
            >
              <Settings className="h-4 w-4" style={{ color: "var(--platform-fg-muted)" }} />
            </button>
          </div>
        </div>

        {/* Contenido: solo flujo guiado */}
        <div
          className="flex-1 overflow-hidden relative rounded-2xl border min-h-0 flex flex-col"
          style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}
        >
          <ETLGuidedFlow ref={guidedFlowRef} etlId={etlId} connections={connections} initialStep={initialGuidedStep} />
        </div>
      </ETLPreviewProvider>
    </div>
  );
}
