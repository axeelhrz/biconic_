"use client";

import { LayoutGrid, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardCardLayoutMode } from "@/types/dashboard";
import { cn } from "@/lib/utils";

type StudioCardLayoutToolbarProps = {
  mode: DashboardCardLayoutMode;
  onModeChange: (mode: DashboardCardLayoutMode) => void;
  onReorganizeAuto?: () => void;
  disabled?: boolean;
};

export function StudioCardLayoutToolbar({
  mode,
  onModeChange,
  onReorganizeAuto,
  disabled = false,
}: StudioCardLayoutToolbarProps) {
  return (
    <div
      className="studio-card-layout-toolbar flex flex-wrap items-center gap-3 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface)]/60 px-4 py-2.5"
      role="group"
      aria-label="Ubicación de tarjetas"
    >
      <div className="flex items-center gap-2 text-[var(--studio-fg-muted)]">
        <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide">Ubicación</span>
      </div>
      <div
        className="studio-card-layout-mode flex rounded-lg border border-[var(--studio-border)] p-0.5"
        role="tablist"
        aria-label="Modo de ubicación"
      >
        {(
          [
            { id: "auto" as const, label: "Automático", hint: "Optimiza huecos en la rejilla" },
            { id: "manual" as const, label: "Manual", hint: "Arrastrá las tarjetas en el lienzo" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={mode === opt.id}
            title={opt.hint}
            disabled={disabled}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              mode === opt.id
                ? "bg-[var(--studio-accent-dim)] text-[var(--studio-accent)]"
                : "text-[var(--studio-fg-muted)] hover:text-[var(--studio-fg)]"
            )}
            onClick={() => onModeChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {mode === "auto" && onReorganizeAuto ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-[var(--studio-fg-muted)] hover:text-[var(--studio-accent)]"
          disabled={disabled}
          onClick={onReorganizeAuto}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reorganizar automáticamente
        </Button>
      ) : null}
      <p className="text-[11px] text-[var(--studio-fg-muted)] max-w-md">
        {mode === "auto"
          ? "Las tarjetas se acomodan solas para reducir espacios vacíos."
          : "Usá el asa de arrastre en cada tarjeta para moverla."}
      </p>
    </div>
  );
}
