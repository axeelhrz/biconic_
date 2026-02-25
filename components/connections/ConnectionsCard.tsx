"use client";

import ImportStatus from "./importStatus";
import AdminClientSelectionModal from "@/components/admin/dashboard/AdminClientSelectionModal";
import { User, Building2, Plus, Database, Trash2, Eye, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

// --- Interfaz de datos actualizada para la nueva tarjeta ---
export interface Connection {
  id: string;
  clientId: string;
  title: string;
  type: string;
  status: "Conectado" | "Desconectado" | "Error" | "Procesando";
  host: string;
  databaseName: string;
  lastSync: string;
  // Campos opcionales para importación
  dataTableId?: string;
  importStatus?: string;
  /** updated_at del data_table; para detectar imports colgados */
  dataTableUpdatedAt?: string;
  creator?: {
    fullName: string | null;
  };
  client?: {
    id: string;
    companyName: string;
    logoUrl?: string | null;
  };
}

// Tipo con color por tecnología
const typeStyle: Record<string, { bg: string; text: string }> = {
  Firebird: { bg: "rgba(8, 205, 239, 0.18)", text: "#08CDEF" },
  MySQL: { bg: "var(--platform-accent-dim)", text: "var(--platform-accent)" },
  PostgreSQL: { bg: "rgba(100, 116, 139, 0.25)", text: "#94a3b8" },
  Excel: { bg: "rgba(34, 197, 94, 0.2)", text: "#22c55e" },
};
const getTypeStyle = (t: string) => typeStyle[t] ?? { bg: "var(--platform-surface-hover)", text: "var(--platform-fg-muted)" };

// Fila de detalle con label + valor
const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] font-medium uppercase tracking-widest opacity-70" style={{ color: "var(--platform-fg-muted)" }}>{label}</span>
    <span className="truncate text-sm font-medium" style={{ color: "var(--platform-fg)" }} title={value}>{value}</span>
  </div>
);

// --- Componente principal de la tarjeta ---
export default function ConnectionsCard({
  connection,
  onConfigure,
  onPreview,
  onDelete,
  onRefreshConnections,
}: {
  connection: Connection;
  onConfigure?: (id: string) => void;
  onPreview?: (id: string) => void;
  onDelete?: (id: string, title?: string) => void;
  onRefreshConnections?: () => void;
}) {
  const { title, type, status, host, databaseName, lastSync, dataTableId } = connection;
  const [assignClientOpen, setAssignClientOpen] = useState(false);
  const supabase = createClient();

  const statusConfig: Record<Connection["status"], { bg: string; text: string; dot?: string }> = {
    Conectado: { bg: "var(--platform-success-dim)", text: "var(--platform-success)", dot: "var(--platform-success)" },
    Desconectado: { bg: "var(--platform-surface-hover)", text: "var(--platform-fg-muted)", dot: "var(--platform-muted)" },
    Error: { bg: "rgba(248,113,113,0.15)", text: "var(--platform-danger)", dot: "var(--platform-danger)" },
    Procesando: { bg: "rgba(251,191,36,0.2)", text: "var(--platform-warning)", dot: "var(--platform-warning)" },
  };

  const currentStatus = statusConfig[status] || statusConfig.Desconectado;
  const typeStyling = getTypeStyle(type);
  const isProcessing = status === "Procesando" && !!dataTableId;

  return (
    <div
      className="group flex h-auto w-full flex-col overflow-hidden rounded-2xl border transition-all duration-200"
      style={{
        background: "var(--platform-surface)",
        borderColor: "var(--platform-border)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.12)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(35, 227, 180, 0.3)";
        e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--platform-border)";
        e.currentTarget.style.boxShadow = "0 2px 16px rgba(0,0,0,0.12)";
      }}
    >
      <div className="flex flex-col gap-5 p-5">
        {/* Header: título + tipo + estado */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "var(--platform-bg-elevated)", color: "var(--platform-accent)" }}
            >
              <Database className="h-6 w-6" strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-semibold leading-tight" style={{ color: "var(--platform-fg)" }}>
                {title}
              </h3>
              <span
                className="mt-1.5 inline-block rounded-md px-2 py-0.5 text-xs font-medium"
                style={{ background: typeStyling.bg, color: typeStyling.text }}
              >
                {type}
              </span>
            </div>
          </div>
          <span
            className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: currentStatus.bg, color: currentStatus.text }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: currentStatus.dot ?? currentStatus.text }} />
            {status}
          </span>
        </div>

        {/* Creador + Cliente en una fila compacta */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--platform-fg-muted)" }}>
            <User className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <span className="truncate">{connection.creator?.fullName || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Building2 className="h-3.5 w-3.5 shrink-0 opacity-80" style={{ color: "var(--platform-fg-muted)" }} />
            {connection.client ? (
              <button
                onClick={() => setAssignClientOpen(true)}
                className="truncate text-left font-medium transition-opacity hover:opacity-80"
                style={{ color: "var(--platform-accent)" }}
              >
                {connection.client.companyName}
              </button>
            ) : (
              <button
                onClick={() => setAssignClientOpen(true)}
                className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-90"
                style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
              >
                <Plus className="h-3 w-3" />
                Asignar cliente
              </button>
            )}
          </div>
        </div>

        {/* Bloque de detalles (Host, Base, Última sync) + info extra */}
        {isProcessing ? (
          <div className="min-h-[100px]">
            <ImportStatus
              dataTableId={dataTableId!}
              compact
              importStartedAt={connection.dataTableUpdatedAt}
              onProcessFinished={() => onRefreshConnections?.()}
            />
          </div>
        ) : (
          <div
            className="rounded-xl border p-4 space-y-4"
            style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}
          >
            <DetailRow label="Host" value={host} />
            <DetailRow label="Base de datos" value={databaseName} />
            <DetailRow label="Última sincronización" value={lastSync} />
            <div className="flex flex-col gap-0.5 pt-1 border-t" style={{ borderColor: "var(--platform-border)" }}>
              <span className="text-[11px] font-medium uppercase tracking-widest opacity-70" style={{ color: "var(--platform-fg-muted)" }}>ID</span>
              <span className="truncate font-mono text-xs" style={{ color: "var(--platform-muted)" }} title={connection.id}>{connection.id.slice(0, 12)}…</span>
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "var(--platform-border)" }}>
          {onPreview && (
            <button
              type="button"
              disabled={isProcessing}
              className="flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)]/30"
              style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
              onClick={() => onPreview(connection.id)}
            >
              <Eye className="h-4 w-4" />
              Vista previa
            </button>
          )}
          <button
            type="button"
            disabled={isProcessing}
            className="flex h-9 flex-1 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-4 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)]/30"
            style={{
              borderColor: "var(--platform-accent)",
              color: "var(--platform-accent)",
              background: "transparent",
            }}
            onClick={() => onConfigure?.(connection.id)}
          >
            <Settings className="h-4 w-4" />
            Configurar
          </button>
          <button
            type="button"
            aria-label="Eliminar conexión"
            disabled={isProcessing}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[rgba(248,113,113,0.12)] disabled:opacity-30"
            style={{ color: "var(--platform-fg-muted)" }}
            onClick={() => onDelete?.(connection.id, connection.title)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AdminClientSelectionModal
        open={assignClientOpen}
        onOpenChange={setAssignClientOpen}
        onSelect={async (clientId) => {
             try {
                 const { error } = await supabase
                    .from("connections")
                    .update({ client_id: clientId })
                    .eq("id", connection.id);

                 if (error) throw error;
                 
                 // Recargar para ver los cambios
                 window.location.reload(); 
                 setAssignClientOpen(false);
             } catch (e) {
                 console.error("Error asignando cliente:", e);
                 alert("Error asignando cliente");
             }
        }}
      />
    </div>
  );
}
