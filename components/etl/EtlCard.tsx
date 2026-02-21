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
  User,
  Building2,
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
  client?: { name: string | null };
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

  const showClient = etl.clientId || etl.client?.name;
  const showOwner = etl.ownerId || etl.owner?.fullName;

  return (
    <article
      className="group relative flex w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border transition-all duration-200 hover:shadow-lg"
      style={{
        background: "linear-gradient(180deg, #1a1d21 0%, #141619 100%)",
        borderColor: "rgba(34, 197, 94, 0.2)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.04)",
      }}
    >
      {/* Barra superior de estado */}
      <div
        className="h-1.5 w-full shrink-0"
        style={{
          background: isPublished
            ? "linear-gradient(90deg, #16a34a 0%, #22c55e 100%)"
            : isDraft
              ? "linear-gradient(90deg, #ca8a04 0%, #eab308 100%)"
              : "rgba(255,255,255,0.08)",
        }}
      />

      <div className="flex flex-1 flex-col p-6">
        {/* Header: badge + título */}
        <div className="mb-4">
          <span
            className="inline-flex rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{
              background: isPublished
                ? "rgba(34, 197, 94, 0.18)"
                : isDraft
                  ? "rgba(234, 179, 8, 0.18)"
                  : "rgba(255,255,255,0.08)",
              color: isPublished
                ? "#4ade80"
                : isDraft
                  ? "#facc15"
                  : "rgba(255,255,255,0.6)",
            }}
          >
            {status}
          </span>
          <h3
            className="mt-4 line-clamp-2 text-xl font-semibold leading-tight"
            style={{ color: "rgba(255,255,255,0.95)" }}
          >
            {title}
          </h3>
          {description && (
            <p
              className="mt-2 line-clamp-2 text-sm leading-relaxed"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              {description}
            </p>
          )}

          {/* Cliente + Creado por */}
          {(showClient || showOwner) && (
            <div
              className="mt-4 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border p-3"
              style={{
                borderColor: "rgba(34, 197, 94, 0.15)",
                background: "rgba(0,0,0,0.2)",
              }}
            >
              {showClient && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Cliente
                    </span>
                    <p className="text-sm font-medium truncate" style={{ color: "rgba(255,255,255,0.9)" }} title={etl.client?.name ?? undefined}>
                      {etl.client?.name ?? "—"}
                    </p>
                  </div>
                </div>
              )}
              {showOwner && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Creado por
                    </span>
                    <p className="text-sm font-medium truncate" style={{ color: "rgba(255,255,255,0.9)" }} title={etl.owner?.fullName ?? undefined}>
                      {etl.owner?.fullName ?? "—"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mini stats */}
        <div
          className="mb-5 grid grid-cols-3 gap-4 rounded-xl border p-4"
          style={{
            borderColor: "rgba(34, 197, 94, 0.12)",
            background: "rgba(0,0,0,0.15)",
          }}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.8)" }} />
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
                Última ejec.
              </span>
            </div>
            <span className="text-xs font-medium truncate" style={{ color: "rgba(255,255,255,0.9)" }} title={lastExecution}>
              {lastExecution || "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.8)" }} />
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
                Próxima
              </span>
            </div>
            <span className="text-xs font-medium truncate" style={{ color: "rgba(255,255,255,0.9)" }} title={nextExecution}>
              {nextExecution || "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.8)" }} />
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
                Creado
              </span>
            </div>
            <span className="text-xs font-medium truncate" style={{ color: "rgba(255,255,255,0.9)" }} title={createdAt}>
              {createdAt || "—"}
            </span>
          </div>
        </div>

        {/* Acciones */}
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleEjecutar}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", color: "#fff", boxShadow: "0 2px 8px rgba(34, 197, 94, 0.3)" }}
            title={basePath === "/admin/etl" ? "Crear dashboard con este ETL" : "Abrir para ejecutar"}
          >
            <Play className="h-4 w-4" />
            <span>Ejecutar</span>
          </button>
          <button
            type="button"
            onClick={() => setPreviewModalOpen(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors hover:opacity-90"
            style={{ borderColor: "rgba(34, 197, 94, 0.35)", color: "rgba(255,255,255,0.9)" }}
            title="Vista previa (solo lectura)"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Vista previa</span>
          </button>
          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors hover:opacity-90"
            style={{ borderColor: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.85)" }}
            title="Compartir"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push(`${basePath}/${etl.id}${editPathSuffix ?? ""}`)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors hover:opacity-90"
            style={{ borderColor: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.85)" }}
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Eliminar"
            onClick={() => setDeleteModalOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors hover:opacity-90"
            style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }}
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
