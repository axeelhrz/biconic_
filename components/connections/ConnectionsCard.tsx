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

// Icono de la base de datos (placeholder)
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
      stroke="#181818"
      strokeWidth="1.5"
    />
    <path
      d="M16 4.33398C16 6.01465 12.4183 7.33398 8 7.33398C3.58167 7.33398 0 6.01465 0 4.33398C0 2.65332 3.58167 1.33398 8 1.33398C12.4183 1.33398 16 2.65332 16 4.33398Z"
      stroke="#181818"
      strokeWidth="1.5"
    />
    <path
      d="M0 10.334V1.33398"
      stroke="#181818"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M16 10.334V1.33398"
      stroke="#181818"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

// Icono de la papelera
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
      stroke="black"
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

const InfoField = ({ label, value }: { label: string; value: string }) => (
  <div className="flex w-full flex-col items-start self-stretch">
    <p className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>{label}</p>
    <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{value}</p>
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


  const statusConfig: Record<Connection["status"], { bg: string; text: string }> = {
    Conectado: { bg: "var(--platform-success-dim)", text: "var(--platform-success)" },
    Desconectado: { bg: "var(--platform-surface-hover)", text: "var(--platform-fg-muted)" },
    Error: { bg: "rgba(248,113,113,0.15)", text: "var(--platform-danger)" },
    Procesando: { bg: "var(--platform-warning)/20", text: "var(--platform-warning)" },
  };

  const currentStatus = statusConfig[status] || statusConfig.Desconectado;
  const isProcessing = status === "Procesando" && !!dataTableId;

  return (
    <div
      className="box-border flex h-auto w-full max-w-[310px] flex-col items-start gap-5 rounded-[25px] border p-5 transition-shadow hover:border-[var(--platform-accent)]"
      style={{
        background: "var(--platform-surface)",
        borderColor: "var(--platform-border)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
      }}
    >
      <div className="flex w-full flex-row items-start gap-[15px] self-stretch">
        <div
          className="flex h-[40px] w-[40px] flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--platform-bg-elevated)" }}
        >
          <DatabaseIcon className="[&_path]:stroke-[var(--platform-fg-muted)]" />
        </div>
        <div className="flex flex-col items-start">
          <h3 className="text-base font-medium" style={{ color: "var(--platform-fg)" }}>
            {title}
          </h3>
          <p className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>
            {type}
          </p>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--platform-fg-muted)" }}>
          <User className="h-3.5 w-3.5" />
          <span className="font-medium">Creador:</span>
          <span className="truncate">{connection.creator?.fullName || "Desconocido"}</span>
        </div>

        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--platform-fg-muted)" }}>
          <Building2 className="h-3.5 w-3.5" />
          <span className="font-medium">Cliente:</span>
          {connection.client ? (
            <button
              onClick={() => setAssignClientOpen(true)}
              className="truncate text-left hover:underline"
              style={{ color: "var(--platform-accent)" }}
            >
              {connection.client.companyName}
            </button>
          ) : (
            <button
              onClick={() => setAssignClientOpen(true)}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium hover:opacity-90"
              style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
            >
              <Plus className="h-3 w-3" />
              Asignar
            </button>
          )}
        </div>
      </div>

      <span
        className="flex items-center justify-center rounded-[10px] px-1.5 py-0.5 text-[10px] font-medium"
        style={{ background: currentStatus.bg, color: currentStatus.text }}
      >
        {status}
      </span>

      {/* Sección de detalles o PROGRESO */}
      {isProcessing ? (
          <div className="flex w-full flex-col items-start gap-4 self-stretch min-h-[100px] justify-center">
             <ImportStatus 
                dataTableId={dataTableId!} 
                compact 
                importStartedAt={connection.dataTableUpdatedAt}
                onProcessFinished={() => onRefreshConnections?.()} 
             />
          </div>
      ) : (
        <div className="flex w-full flex-col items-start gap-4 self-stretch">
            <InfoField label="Host" value={host} />
            <InfoField label="Base de datos" value={databaseName} />
            <InfoField label="Última sincronización" value={lastSync} />
        </div>
      )}

      <div className="mt-auto flex w-full flex-row items-center gap-2.5 self-stretch pt-2">
        <button
          type="button"
          aria-label="Compartir conexión"
          className="flex-shrink-0 p-1 transition-opacity hover:opacity-70 disabled:opacity-30"
          style={{ color: "var(--platform-fg-muted)" }}
          onClick={() => setShareModalOpen(true)}
          disabled={isProcessing}
        >
          <ShareIcon className="h-5 w-5" />
        </button>
        {isFirebird && (
          <button
            type="button"
            aria-label="Configurar tablas para ETL"
            disabled={isProcessing}
            className="flex-shrink-0 p-1 transition-opacity hover:opacity-70 disabled:opacity-30"
            style={{ color: "var(--platform-fg-muted)" }}
            onClick={() => setTablesDialogOpen(true)}
            title="Tablas para ETL"
          >
            <Table2 className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          disabled={isProcessing}
          className={`box-border flex h-[34px] flex-grow flex-row flex-wrap content-center items-center justify-center gap-2 rounded-full border px-3 py-[7px] text-[13px] font-medium transition-colors ${isProcessing ? "cursor-not-allowed opacity-50" : "hover:opacity-90"}`}
          style={{
            borderColor: "var(--platform-border)",
            color: "var(--platform-fg)",
          }}
          onClick={() => onConfigure?.(connection.id)}
        >
          Configurar
        </button>
        <button
          type="button"
          aria-label="Eliminar conexión"
          disabled={isProcessing}
          className="flex-shrink-0 p-1 transition-opacity hover:opacity-70 disabled:opacity-30"
          style={{ color: "var(--platform-fg-muted)" }}
          onClick={() => onDelete?.(connection.id, connection.title)}
        >
          <TrashIcon className="h-5 w-5" />
        </button>
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
