"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  ChevronLeft,
  MoreHorizontal,
  Eye,
  Play,
  Save,
  BarChart2,
  Send,
  Undo2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DashboardHeaderDetails } from "./DashboardHeaderDetails";
import { DeleteDashboardDialog } from "./DeleteDashboardDialog";

export type DashboardStatus = "borrador" | "activo" | "en_ejecucion";
export type StudioMode = "explorar" | "disenar" | "presentar";

type StudioHeaderProps = {
  dashboardId: string;
  title: string;
  etlId?: string | null;
  etlName?: string | null;
  onEtlChange?: () => void;
  status: DashboardStatus;
  /** Publicado para viewers del cliente (campo `published` / visibility). */
  isPublished?: boolean;
  lastUpdateLabel?: string;
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  isDirty?: boolean;
  isSaving?: boolean;
  onSave?: () => void;
  onRun?: () => void;
  /** Guarda cambios pendientes antes de abrir la vista previa (/view). */
  onBeforePreview?: () => void | Promise<void>;
  /** Publicar o despublicar para el rol viewer. */
  onPublishChange?: (published: boolean) => void | Promise<void>;
  /** Si true, no se muestra "Ejecutar métricas" (los datos se cargan solos al abrir). */
  hideRunButton?: boolean;
};

const MODES: { id: StudioMode; label: string; hint: string }[] = [
  { id: "explorar", label: "Explorar", hint: "Vista limpia para probar filtros y datos" },
  { id: "disenar", label: "Diseñar", hint: "Editar layout, métricas y configuración" },
  { id: "presentar", label: "Presentar", hint: "Solo el lienzo, sin herramientas" },
];

const STATUS_LABELS: Record<DashboardStatus, string> = {
  borrador: "Borrador",
  activo: "Activo",
  en_ejecucion: "En ejecución",
};

export function StudioHeader({
  dashboardId,
  title,
  etlId,
  etlName,
  onEtlChange,
  status,
  isPublished = false,
  lastUpdateLabel,
  mode,
  onModeChange,
  isDirty,
  isSaving,
  onSave,
  onRun,
  onBeforePreview,
  onPublishChange,
  hideRunButton = false,
}: StudioHeaderProps) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const openPreview = useCallback(async () => {
    if (onBeforePreview) await onBeforePreview();
    router.push(`/admin/dashboard/${dashboardId}/view`);
  }, [dashboardId, onBeforePreview, router]);

  const handlePublishToggle = useCallback(async () => {
    if (!onPublishChange || publishing) return;
    setPublishing(true);
    try {
      await onPublishChange(!isPublished);
    } finally {
      setPublishing(false);
    }
  }, [onPublishChange, isPublished, publishing]);

  return (
    <>
      <header className="studio-header flex flex-shrink-0 items-center">
        <div className="mx-auto flex h-full w-full max-w-[1400px] items-center justify-between gap-6 px-6">
          <div className="flex min-w-0 flex-1 items-center gap-6">
            <Link
              href="/admin/dashboard"
              className="studio-header-back flex shrink-0 items-center gap-2 text-[var(--studio-text-small)] font-medium text-[var(--studio-muted)] transition-colors hover:text-[var(--studio-accent)]"
              aria-label="Volver a dashboards"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboards</span>
            </Link>
            <div className="h-5 w-px shrink-0 bg-[var(--studio-border)]" aria-hidden />
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="studio-header-title min-w-0 truncate">
                <DashboardHeaderDetails
                  dashboardId={dashboardId}
                  title={title}
                  etlId={etlId}
                  etlName={etlName}
                  onEtlChange={onEtlChange}
                />
              </div>
              <span
                className="studio-status-badge flex-shrink-0 rounded-full px-3 py-1.5 text-[var(--studio-text-caption)]"
                data-status={status}
              >
                {STATUS_LABELS[status]}
              </span>
              <span
                className="hidden sm:inline flex-shrink-0 rounded-full px-3 py-1.5 text-[var(--studio-text-caption)] font-medium"
                style={{
                  background: isPublished
                    ? "color-mix(in srgb, var(--studio-accent) 18%, transparent)"
                    : "color-mix(in srgb, var(--studio-muted) 18%, transparent)",
                  color: isPublished ? "var(--studio-accent)" : "var(--studio-muted)",
                }}
                title={
                  isPublished
                    ? "Visible para viewers del cliente"
                    : "Solo visible en admin hasta publicar"
                }
              >
                {isPublished ? "Publicado" : "No publicado"}
              </span>
            </div>
            {lastUpdateLabel && (
              <span className="hidden shrink-0 text-[var(--studio-text-small)] text-[var(--studio-muted)] xl:inline">
                {lastUpdateLabel}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <div
              className="studio-mode-selector flex rounded-[var(--studio-radius-sm)] p-1"
              role="tablist"
              aria-label="Modo del studio"
            >
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === m.id}
                  className={`rounded-lg px-4 py-2 text-[var(--studio-text-small)] font-semibold transition-all ${
                    mode === m.id
                      ? "text-[var(--studio-accent)]"
                      : "text-[var(--studio-muted)] hover:text-[var(--studio-fg-muted)]"
                  }`}
                  onClick={() => onModeChange(m.id)}
                  title={m.hint}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {onPublishChange && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[var(--studio-text-small)] font-semibold text-[var(--studio-accent)] hover:bg-[var(--studio-accent-dim)] hover:text-[var(--studio-accent)]"
                  onClick={() => void handlePublishToggle()}
                  disabled={publishing || isSaving}
                  title={
                    isPublished
                      ? "Quitar de la vista de clientes"
                      : "Hacer visible para el rol viewer"
                  }
                >
                  {isPublished ? <Undo2 className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                  {publishing
                    ? isPublished
                      ? "Despublicando…"
                      : "Publicando…"
                    : isPublished
                      ? "Despublicar"
                      : "Publicar"}
                </Button>
              )}
              {isDirty && onSave && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[var(--studio-text-small)] font-semibold text-[var(--studio-accent)] hover:bg-[var(--studio-accent-dim)] hover:text-[var(--studio-accent)]"
                  onClick={onSave}
                  disabled={isSaving}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? "Guardando…" : "Guardar"}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl text-[var(--studio-muted)] hover:bg-[var(--studio-surface)] hover:text-[var(--studio-fg)]"
                    aria-label="Acciones"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="studio-header-menu-content min-w-[200px] rounded-[var(--studio-radius-sm)] border-[var(--studio-border)] bg-[var(--studio-surface)] p-1.5 shadow-xl"
                >
                  {etlId && (
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/admin/etl/${etlId}/metrics`}
                        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[var(--studio-text-body)] text-[var(--studio-accent)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                      >
                        <BarChart2 className="h-4 w-4" />
                        Ir a métricas del ETL
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      void openPreview();
                    }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[var(--studio-text-body)] text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)] cursor-pointer"
                  >
                    <Eye className="h-4 w-4" />
                    Vista previa
                  </DropdownMenuItem>
                  {!hideRunButton && onRun && (
                    <DropdownMenuItem
                      onClick={onRun}
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[var(--studio-text-body)] text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                    >
                      <Play className="h-4 w-4" />
                      Ejecutar métricas
                    </DropdownMenuItem>
                  )}
                  {onSave && (
                    <>
                      <DropdownMenuSeparator className="bg-[var(--studio-border)]" />
                      <DropdownMenuItem
                        onClick={onSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[var(--studio-text-body)] text-[var(--studio-accent)] focus:bg-[var(--studio-accent-dim)]"
                      >
                        <Save className="h-4 w-4" />
                        {isSaving ? "Guardando…" : "Guardar"}
                      </DropdownMenuItem>
                    </>
                  )}
                  {onPublishChange && (
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        void handlePublishToggle();
                      }}
                      disabled={publishing || isSaving}
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[var(--studio-text-body)] text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] cursor-pointer"
                    >
                      {isPublished ? <Undo2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                      {isPublished ? "Despublicar" : "Publicar para clientes"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="bg-[var(--studio-border)]" />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setDeleteOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[var(--studio-text-body)] text-red-500 focus:bg-red-500/10 focus:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar dashboard
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <DeleteDashboardDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        dashboardId={dashboardId}
        dashboardTitle={title}
        onSuccess={() => {
          router.push("/admin/dashboard");
        }}
      />
    </>
  );
}
