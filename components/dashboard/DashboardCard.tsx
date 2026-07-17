"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { LayoutDashboard, Send, Trash2, Undo2, MoreHorizontal, Share2 } from "lucide-react";
import EyeIcon from "../icons/EyeIcon";
import ShareDashboardModal from "./ShareDashboardModal";
import { DashboardCardMiniPreview } from "./DashboardCardMiniPreview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Layout guardado (widgets con posición/span) para previsualización en la tarjeta
export type DashboardLayoutPreview = {
  widgets?: Array<{
    id?: string;
    title?: string;
    gridOrder?: number;
    gridSpan?: number;
    type?: string;
    pageId?: string;
    dataSourceId?: string | null;
    source?: { labelField?: string };
    aggregationConfig?: Record<string, unknown>;
  }>;
  pages?: Array<{ id: string; name?: string }>;
  activePageId?: string;
};

// Definimos el tipo de datos que espera la tarjeta
export interface Dashboard {
  id: string;
  title: string;
  imageUrl: string;
  status: "Publicado" | "Borrador"; // Podemos ser específicos con los estados
  description: string;
  views: number;
  owner?: { fullName: string | null };
  // New fields for sharing logic
  clientId?: string;
  ownerId?: string;
  /** Nombre del cliente (p. ej. en vista VIEWER agrupada por empresa) */
  clientLabel?: string;
  /** Si existe, se muestra la previsualización del layout en lugar de la imagen por defecto */
  layout?: DashboardLayoutPreview | null;
}

interface DashboardCardProps {
  dashboard: Dashboard;
  href?: string;
  onDelete?: (dashboard: Dashboard) => void;
  /** Si se define, en borrador se muestra acción para publicar (p. ej. admin). */
  onPublish?: (dashboard: Dashboard) => void | Promise<void>;
  /** Despublicar cuando ya está publicado. */
  onUnpublish?: (dashboard: Dashboard) => void | Promise<void>;
}

export default function DashboardCard({
  dashboard,
  href,
  onDelete,
  onPublish,
  onUnpublish,
}: DashboardCardProps) {
  const {
    id,
    title,
    imageUrl,
    status,
    description,
    views,
    owner,
    layout,
    clientLabel,
  } = dashboard;
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const activePageId = layout?.activePageId ?? layout?.pages?.[0]?.id;
  const hasLayoutPreview =
    Array.isArray(layout?.widgets) &&
    layout.widgets.some((w) => !activePageId || w.pageId === activePageId);

  const statusClasses =
    status === "Publicado"
      ? "bg-[var(--platform-success-dim)] text-[var(--platform-success)]"
      : status === "Borrador"
        ? "bg-[var(--platform-warning)]/20 text-[var(--platform-warning)]"
        : "bg-[var(--platform-surface-hover)] text-[var(--platform-fg-muted)]";

  const runPublish = async (fn: (d: Dashboard) => void | Promise<void>) => {
    setPublishing(true);
    try {
      await fn(dashboard);
    } finally {
      setPublishing(false);
    }
  };

  const hasActions = Boolean(onPublish || onUnpublish || onDelete);

  return (
    <>
      <div
        className="flex w-full flex-col overflow-hidden border transition-shadow hover:border-[var(--platform-accent)]"
        style={{
          background: "var(--platform-surface)",
          borderColor: "var(--platform-border)",
          borderWidth: "var(--platform-card-border-width, 1px)",
          borderRadius: "var(--platform-card-radius, 15px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
        }}
      >
        <Link
          href={href ?? `/dashboard/${id}`}
          aria-label={`Abrir dashboard ${title}`}
          className="block"
        >
          <div className="relative h-[193px] w-full overflow-hidden bg-[var(--platform-bg)]">
            {hasLayoutPreview ? (
              <DashboardCardMiniPreview dashboardId={id} layout={layout!} />
            ) : imageUrl && imageUrl !== "/Image.svg" ? (
              <Image
                src={imageUrl}
                alt={`Vista previa de ${title}`}
                fill
                className="object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full flex-col items-center justify-center gap-2 p-4"
                style={{ color: "var(--platform-fg-muted)" }}
              >
                <LayoutDashboard className="h-10 w-10 opacity-50" />
                <span className="text-xs font-medium">Sin previsualización</span>
                <span className="text-[10px] opacity-80">Abrí el dashboard para diseñar</span>
              </div>
            )}
          </div>
        </Link>

        <div className="flex flex-col gap-2.5 p-5">
          <Link href={href ?? `/dashboard/${id}`} className="block">
            <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
              {title}
            </h3>
          </Link>

          {clientLabel ? (
            <p className="text-xs font-medium -mt-1" style={{ color: "var(--platform-fg-muted)" }}>
              {clientLabel}
            </p>
          ) : null}

          <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses}`}>
            {status}
          </span>

          <p className="h-8 text-xs font-normal" style={{ color: "var(--platform-fg-muted)" }}>
            {description}
          </p>

          {owner && owner.fullName && (
            <p className="mt-1 text-xs font-medium" style={{ color: "var(--platform-accent)" }}>
              Propietario: {owner.fullName}
            </p>
          )}

          <hr className="my-1 border-t" style={{ borderColor: "var(--platform-border)" }} />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5" style={{ color: "var(--platform-fg-muted)" }}>
              <EyeIcon className="h-4 w-4" />
              <span className="text-[10px] font-normal">{views}</span>
            </div>

            <div className="flex items-center gap-1">
              {onPublish && status === "Borrador" && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors hover:opacity-80 disabled:opacity-40"
                  style={{ color: "var(--platform-accent)" }}
                  disabled={publishing}
                  onClick={() => void runPublish(onPublish)}
                  title="Publicar para clientes"
                  aria-label="Publicar dashboard"
                >
                  <Send className="h-4 w-4" />
                  Publicar
                </button>
              )}

              {hasActions && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-md p-1.5 transition-colors hover:opacity-80"
                      style={{ color: "var(--platform-fg-muted)" }}
                      aria-label="Más acciones"
                      title="Más acciones"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[180px]">
                    {onPublish && status === "Borrador" && (
                      <DropdownMenuItem
                        disabled={publishing}
                        onSelect={(e) => {
                          e.preventDefault();
                          void runPublish(onPublish);
                        }}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Publicar para clientes
                      </DropdownMenuItem>
                    )}
                    {onUnpublish && status === "Publicado" && (
                      <DropdownMenuItem
                        disabled={publishing}
                        onSelect={(e) => {
                          e.preventDefault();
                          void runPublish(onUnpublish);
                        }}
                      >
                        <Undo2 className="mr-2 h-4 w-4" />
                        Despublicar
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setShareModalOpen(true);
                      }}
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      Compartir
                    </DropdownMenuItem>
                    {onDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-500 focus:text-red-500"
                          onSelect={(e) => {
                            e.preventDefault();
                            onDelete(dashboard);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {!hasActions && (
                <button
                  type="button"
                  className="rounded-md p-1.5 transition-colors"
                  style={{ color: "var(--platform-fg-muted)" }}
                  onClick={() => setShareModalOpen(true)}
                  title="Compartir Dashboard"
                >
                  <Share2 className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ShareDashboardModal
        dashboardId={dashboard.id}
        clientId={dashboard.clientId}
        ownerId={dashboard.ownerId}
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        dashboardTitle={dashboard.title}
      />
    </>
  );
}
