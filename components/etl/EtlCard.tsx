"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import ShareEtlModal from "./ShareEtlModal";
import { DeleteEtlModal } from "./DeleteEtlModal";
import EtlPreviewModal from "./EtlPreviewModal";
import { deleteEtlAction } from "@/app/(main)/etl/actions";
import { deleteEtlAdmin } from "@/app/admin/(main)/etl/actions";
import { toast } from "sonner";
import {
  Play,
  Eye,
  Share2,
  Pencil,
  Trash2,
  Calendar,
  Zap,
  Clock,
} from "lucide-react";

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
  owner?: { fullName: string | null };
  ownerId?: string;
}

export default function EtlCard({
  etl,
  onDeleted,
  basePath = "/etl",
  useAdminDelete = false,
  editPathSuffix,
}: {
  etl: Etl;
  onDeleted?: () => void;
  basePath?: string;
  useAdminDelete?: boolean;
  editPathSuffix?: string;
}) {
  const router = useRouter();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
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

  const isPublished = status === "Conectado" || status === "Publicado";
  const isDraft = status === "Borrador";

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
    } catch {
      toast.error("Error al eliminar ETL");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEjecutar = () => {
    if (basePath === "/admin/etl") {
      router.push(`/admin/dashboard?create=1&etlId=${etl.id}`);
    } else {
      router.push(`${basePath}/${etl.id}?run=1`);
    }
  };

  return (
    <article
      className="group relative flex w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border transition-all duration-200 hover:shadow-xl hover:shadow-black/5"
      style={{
        background: "var(--platform-surface)",
        borderColor: "var(--platform-border)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      {/* Barra superior de estado */}
      <div
        className="h-1 w-full shrink-0"
        style={{
          background: isPublished
            ? "linear-gradient(90deg, var(--platform-success) 0%, var(--platform-success) 100%)"
            : isDraft
              ? "linear-gradient(90deg, var(--platform-warning) 0%, var(--platform-warning) 100%)"
              : "var(--platform-border)",
        }}
      />

      <div className="flex flex-1 flex-col p-5">
        {/* Header: badge + título */}
        <div className="mb-4">
          <span
            className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
            style={{
              background: isPublished
                ? "rgba(34, 197, 94, 0.12)"
                : isDraft
                  ? "rgba(234, 179, 8, 0.12)"
                  : "var(--platform-surface-hover)",
              color: isPublished
                ? "var(--platform-success, #22c55e)"
                : isDraft
                  ? "var(--platform-warning, #eab308)"
                  : "var(--platform-fg-muted)",
            }}
          >
            {status}
          </span>
          <h3
            className="mt-3 line-clamp-2 text-lg font-semibold leading-tight"
            style={{ color: "var(--platform-fg)" }}
          >
            {title}
          </h3>
          {description && (
            <p
              className="mt-1.5 line-clamp-2 text-sm leading-relaxed"
              style={{ color: "var(--platform-fg-muted)" }}
            >
              {description}
            </p>
          )}
          {etl.owner?.fullName && (
            <p
              className="mt-2 text-xs font-medium"
              style={{ color: "var(--platform-fg-muted)" }}
            >
              {etl.owner.fullName}
            </p>
          )}
        </div>

        {/* Mini stats */}
        <div
          className="mb-4 grid grid-cols-3 gap-3 rounded-xl border p-3"
          style={{
            borderColor: "var(--platform-border)",
            background: "var(--platform-bg)",
          }}
        >
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" style={{ color: "var(--platform-fg-muted)" }} />
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--platform-fg-muted)" }}>
                Última ejec.
              </span>
            </div>
            <span className="text-xs font-medium truncate" style={{ color: "var(--platform-fg)" }} title={lastExecution}>
              {lastExecution || "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" style={{ color: "var(--platform-fg-muted)" }} />
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--platform-fg-muted)" }}>
                Próxima
              </span>
            </div>
            <span className="text-xs font-medium truncate" style={{ color: "var(--platform-fg)" }} title={nextExecution}>
              {nextExecution || "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" style={{ color: "var(--platform-fg-muted)" }} />
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--platform-fg-muted)" }}>
                Creado
              </span>
            </div>
            <span className="text-xs font-medium truncate" style={{ color: "var(--platform-fg)" }} title={createdAt}>
              {createdAt || "—"}
            </span>
          </div>
        </div>

        {/* Acciones */}
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleEjecutar}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
            title={basePath === "/admin/etl" ? "Crear dashboard con este ETL" : "Abrir para ejecutar"}
          >
            <Play className="h-4 w-4" />
            <span>Ejecutar</span>
          </button>
          <button
            type="button"
            onClick={() => setPreviewModalOpen(true)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors hover:opacity-90"
            style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            title="Vista previa (solo lectura)"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Vista previa</span>
          </button>
          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors hover:opacity-90"
            style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            title="Compartir"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push(`${basePath}/${etl.id}${editPathSuffix ?? ""}`)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors hover:opacity-90"
            style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Eliminar"
            onClick={() => setDeleteModalOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors hover:opacity-90"
            style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
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
      <EtlPreviewModal
        etlId={etl.id}
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
        etlTitle={title}
      />
    </article>
  );
}
