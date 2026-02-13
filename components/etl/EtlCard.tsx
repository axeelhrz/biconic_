"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import ShareEtlModal from "./ShareEtlModal";
import { DeleteEtlModal } from "./DeleteEtlModal";
import { deleteEtlAction } from "@/app/(main)/etl/actions";
import { deleteEtlAdmin } from "@/app/admin/(main)/etl/actions";
import { toast } from "sonner";

// --- Iconos necesarios para los botones ---

// Icono de "Más" para el botón Ejecutar
const PlusIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
    />
  </svg>
);

// Icono de "Papelera" para el botón de eliminar
const TrashIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="currentColor"
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z"
      clipRule="evenodd"
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

// --- Interfaz de datos actualizada para la tarjeta ---
export interface Etl {
  id: string;
  clientId: string;
  title: string;
  description: string;
  status: "Conectado" | "Desconectado" | "Publicado" | "Borrador";
  lastExecution: string;
  nextExecution: string;
  createdAt: string;
  imageUrl: string;
  views: number;
  owner?: {
    fullName: string | null;
  };
  ownerId?: string;
}

// --- Componente de Tarjeta modificado ---
export default function EtlCard({
  etl,
  onDeleted,
  basePath = "/etl",
  useAdminDelete = false,
}: {
  etl: Etl;
  onDeleted?: () => void;
  basePath?: string;
  useAdminDelete?: boolean;
}) {
  const router = useRouter();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteAction = useAdminDelete ? deleteEtlAdmin : deleteEtlAction;
  const {
    title,
    description,
    status,
    lastExecution,
    nextExecution,
    createdAt,
  } = etl;

  const statusClasses =
    status === "Conectado" || status === "Publicado"
      ? "bg-[var(--platform-success-dim)] text-[var(--platform-success)]"
      : status === "Borrador"
      ? "bg-[var(--platform-warning)]/20 text-[var(--platform-warning)]"
      : "bg-[var(--platform-surface-hover)] text-[var(--platform-fg-muted)]";

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await deleteAction(etl.id);
      if (!res.ok) {
        toast.error(res.error || "Error al eliminar ETL");
        return;
      }
      toast.success("ETL eliminado correctamente");
      setDeleteModalOpen(false);
      onDeleted?.();
    } catch (error) {
      toast.error("Error al eliminar ETL");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="flex h-[335px] w-full max-w-[424px] flex-col justify-between rounded-[20px] border p-5 font-sans transition-shadow hover:border-[var(--platform-accent)]"
      style={{
        background: "var(--platform-surface)",
        borderColor: "var(--platform-border)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
      }}
    >
      <div className="flex flex-col items-start gap-4">
        <span
          className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses}`}
        >
          {status}
        </span>

        <div className="flex flex-col">
          <h3 className="text-base font-medium" style={{ color: "var(--platform-fg)" }}>{title}</h3>
          <p className="text-sm font-normal" style={{ color: "var(--platform-fg-muted)" }}>{description}</p>
          {etl.owner && (
            <p className="mt-1 text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>
              Dueño: {etl.owner.fullName || "Desconocido"}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2.5 self-stretch">
          <div>
            <p className="text-sm font-normal" style={{ color: "var(--platform-fg-muted)" }}>
              Última ejecución
            </p>
            <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{lastExecution}</p>
          </div>
          <div>
            <p className="text-sm font-normal" style={{ color: "var(--platform-fg-muted)" }}>
              Próxima ejecución
            </p>
            <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{nextExecution}</p>
          </div>
          <div>
            <p className="text-sm font-normal" style={{ color: "var(--platform-fg-muted)" }}>Creado</p>
            <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{createdAt}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2.5">
        <button
          type="button"
          className="flex h-[34px] items-center justify-center gap-2 rounded-full px-3 text-sm font-medium hover:opacity-90"
          style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
          onClick={() => router.push(`${basePath}/${etl.id}?run=1`)}
        >
          <PlusIcon className="h-4 w-4" />
          <span>Ejecutar</span>
        </button>

        <button
          className="flex h-[34px] items-center justify-center gap-2 rounded-full border px-3 text-sm font-medium hover:opacity-90"
          style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
          onClick={() => setShareModalOpen(true)}
          title="Compartir"
        >
          <ShareIcon className="h-4 w-4" />
        </button>

        <button
          className="flex h-[34px] items-center justify-center rounded-full border px-4 text-sm font-medium hover:opacity-90"
          style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
          onClick={() => router.push(`${basePath}/${etl.id}`)}
        >
          Editar
        </button>

        <button
          aria-label="Eliminar"
          className="transition-colors hover:opacity-80"
          style={{ color: "var(--platform-fg-muted)" }}
          onClick={() => setDeleteModalOpen(true)}
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
      <ShareEtlModal
        etlId={etl.id}
        clientId={etl.clientId}
        ownerId={etl.ownerId}
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
      />
      <DeleteEtlModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onConfirm={handleDelete}
        etlName={title}
        isDeleting={isDeleting}
      />
    </div>
  );
}
