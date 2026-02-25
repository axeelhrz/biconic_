"use client"
import ShareConnectionModal from "../connection/ShareConnectionModal";
import ImportStatus from "./importStatus";
import AdminClientSelectionModal from "@/components/admin/dashboard/AdminClientSelectionModal";
import ConnectionTablesDialog from "./ConnectionTablesDialog";
import { User, Building2, Plus, Table2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// --- Iconos necesarios para la tarjeta ---

// Icono de la base de datos (hereda color con currentColor)
const DatabaseIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="18"
    viewBox="0 0 16 18"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8 7.33398C3.58167 7.33398 0 8.65332 0 10.334V14.334C0 16.0146 3.58167 17.334 8 17.334C12.4183 17.334 16 16.0146 16 14.334V10.334C16 8.65332 12.4183 7.33398 8 7.33398Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M16 4.33398C16 6.01465 12.4183 7.33398 8 7.33398C3.58167 7.33398 0 6.01465 0 4.33398C0 2.65332 3.58167 1.33398 8 1.33398C12.4183 1.33398 16 2.65332 16 4.33398Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M0 10.334V1.33398"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M16 10.334V1.33398"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

// Icono de la papelera (hereda color)
const TrashIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M18.3334 4.16602H15.8334M1.66675 4.16602H4.16675M4.16675 4.16602V17.4993C4.16675 17.9591 4.35102 18.3983 4.68943 18.7233C5.02784 19.0483 5.48624 19.2327 5.96675 19.2327H14.0334C14.5139 19.2327 14.9723 19.0483 15.3107 18.7233C15.6491 18.3983 15.8334 17.9591 15.8334 17.4993V4.16602M4.16675 4.16602H15.8334M7.50008 8.33268V14.166M12.5001 8.33268V14.166M6.66675 4.16602L7.29175 1.50352C7.45663 0.852139 8.04683 0.403625 8.72929 0.403625H11.2709C11.9534 0.403625 12.5436 0.852139 12.7085 1.50352L13.3334 4.16602"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Icono de "Compartir"
const ShareIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M18 16.08C17.24 16.08 16.56 16.38 16.04 16.85L8.91 12.7C8.96 12.47 9 12.24 9 12C9 11.76 8.96 11.53 8.91 11.3L15.96 7.19C16.5 7.69 17.21 8 18 8C19.66 8 21 6.66 21 5C21 3.34 19.66 2 18 2C16.34 2 15 3.34 15 5C15 5.24 15.04 5.47 15.09 5.7L8.04 9.81C7.5 9.31 6.79 9 6 9C4.34 9 3 10.34 3 12C3 13.66 4.34 15 6 15C6.79 15 7.5 15.31 8.04 15.81L15.12 19.95C15.08 20.17 15.04 20.4 15.04 20.62C15.04 22.28 16.38 23.62 18.04 23.62C19.7 23.62 21.04 22.28 21.04 20.62C21.04 18.96 19.7 17.62 18 17.62"
      fill="currentColor"
    />
  </svg>
);

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
  onDelete,
  onRefreshConnections,
}: {
  connection: Connection;
  onConfigure?: (id: string) => void;
  onDelete?: (id: string, title?: string) => void;
  onRefreshConnections?: () => void;
}) {
  const router = useRouter();

  const { title, type, status, host, databaseName, lastSync, dataTableId } = connection;
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [assignClientOpen, setAssignClientOpen] = useState(false);
  const [tablesDialogOpen, setTablesDialogOpen] = useState(false);
  const supabase = createClient();
  const isFirebird = type === "Firebird";

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
      {/* Barra superior de acento */}
      <div className="h-1 w-full" style={{ background: "var(--platform-gradient)" }} />

      <div className="flex flex-col gap-5 p-5">
        {/* Header: título + tipo + estado */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "var(--platform-bg-elevated)", color: "var(--platform-fg-muted)" }}
            >
              <DatabaseIcon className="h-6 w-6" />
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

        {/* Bloque de detalles (Host, Base, Última sync) */}
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
          </div>
        )}

        {/* Acciones */}
        <div className="flex items-center gap-2 border-t pt-4" style={{ borderColor: "var(--platform-border)" }}>
          <button
            type="button"
            aria-label="Compartir conexión"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--platform-surface-hover)] disabled:opacity-30"
            style={{ color: "var(--platform-fg-muted)" }}
            onClick={() => setShareModalOpen(true)}
            disabled={isProcessing}
          >
            <ShareIcon className="h-4 w-4" />
          </button>
          {isFirebird && (
            <button
              type="button"
              aria-label="Configurar tablas para ETL"
              disabled={isProcessing}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--platform-surface-hover)] disabled:opacity-30"
              style={{ color: "var(--platform-fg-muted)" }}
              onClick={() => setTablesDialogOpen(true)}
              title="Tablas para ETL"
            >
              <Table2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            disabled={isProcessing}
            className="flex h-9 flex-1 items-center justify-center rounded-xl border px-4 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)]/30"
            style={{
              borderColor: "var(--platform-accent)",
              color: "var(--platform-accent)",
              background: "transparent",
            }}
            onClick={() => onConfigure?.(connection.id)}
          >
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
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ConnectionTablesDialog
        open={tablesDialogOpen}
        onOpenChange={setTablesDialogOpen}
        connectionId={connection.id}
        connectionTitle={connection.title}
        connectionType={type}
        onSaved={() => window.location.reload()}
      />
      <ShareConnectionModal
        connectionId={connection.id}
        clientId={connection.clientId}
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
      />
      
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
