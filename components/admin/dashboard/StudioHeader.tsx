"use client";

import Link from "next/link";
import { ChevronLeft, MoreHorizontal, Eye, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DashboardHeaderDetails } from "./DashboardHeaderDetails";

export type DashboardStatus = "borrador" | "activo" | "en_ejecucion";
export type StudioMode = "explorar" | "disenar" | "presentar";

type StudioHeaderProps = {
  dashboardId: string;
  title: string;
  etlName?: string | null;
  status: DashboardStatus;
  lastUpdateLabel?: string;
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  isDirty?: boolean;
  isSaving?: boolean;
  onSave?: () => void;
  onRun?: () => void;
};

const MODES: { id: StudioMode; label: string }[] = [
  { id: "explorar", label: "Explorar" },
  { id: "disenar", label: "Diseñar" },
  { id: "presentar", label: "Presentar" },
];

const STATUS_LABELS: Record<DashboardStatus, string> = {
  borrador: "Borrador",
  activo: "Activo",
  en_ejecucion: "En ejecución",
};

export function StudioHeader({
  dashboardId,
  title,
  etlName,
  status,
  lastUpdateLabel,
  mode,
  onModeChange,
  isDirty,
  isSaving,
  onSave,
  onRun,
}: StudioHeaderProps) {
  return (
    <header className="studio-header flex flex-shrink-0 items-center">
      <div className="mx-auto flex h-full w-full max-w-[1400px] items-center justify-between gap-6 px-6">
        {/* Orden: volver | título + estado | última actualización */}
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
              <DashboardHeaderDetails dashboardId={dashboardId} title={title} etlName={etlName} />
            </div>
            <span
              className="studio-status-badge flex-shrink-0 rounded-full px-3 py-1.5 text-[var(--studio-text-caption)]"
              data-status={status}
            >
              {STATUS_LABELS[status]}
            </span>
          </div>
          {lastUpdateLabel && (
            <span className="hidden shrink-0 text-[var(--studio-text-small)] text-[var(--studio-muted)] xl:inline">
              {lastUpdateLabel}
            </span>
          )}
        </div>

        {/* Modos + acciones */}
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
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
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
                <DropdownMenuItem asChild>
                  <Link
                    href={`/admin/dashboard/${dashboardId}/view`}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[var(--studio-text-body)] text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                  >
                    <Eye className="h-4 w-4" />
                    Vista previa
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onRun}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[var(--studio-text-body)] text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                >
                  <Play className="h-4 w-4" />
                  Ejecutar métricas
                </DropdownMenuItem>
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
