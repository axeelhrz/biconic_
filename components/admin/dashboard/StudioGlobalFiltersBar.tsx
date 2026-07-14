"use client";

import Link from "next/link";
import { Filter, ImageIcon, Pencil, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudioMode } from "./StudioHeader";

type GlobalFilterLike = {
  id: string;
  field?: string;
  label?: string;
};

type FilterFieldOption = { value: string; label: string };

export type StudioGlobalFiltersBarProps = {
  mode: StudioMode;
  globalFilters: GlobalFilterLike[];
  filterFieldOptions: FilterFieldOption[];
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onEditFilter: (id: string) => void;
  onRemoveFilter: (id: string) => void;
  onAddFilter: (field: string) => void;
  onAddImage: () => void;
  etlId?: string | null;
};

export function StudioGlobalFiltersBar({
  mode,
  globalFilters,
  filterFieldOptions,
  settingsOpen,
  onToggleSettings,
  onEditFilter,
  onRemoveFilter,
  onAddFilter,
  onAddImage,
  etlId,
}: StudioGlobalFiltersBarProps) {
  const isDesign = mode === "disenar";

  return (
    <div className="studio-global-filters-bar flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-[var(--studio-border)] bg-[var(--studio-bg-elevated)]/90 px-4 py-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--studio-fg-muted)]">
        <Filter className="h-3.5 w-3.5" />
        Filtros
      </span>

      {globalFilters.length === 0 ? (
        <span className="text-xs text-[var(--studio-fg-muted)]">Sin filtros globales</span>
      ) : (
        globalFilters.map((gf) => (
          <span
            key={gf.id}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--studio-fg)]"
          >
            {isDesign ? (
              <button
                type="button"
                onClick={() => onEditFilter(gf.id)}
                className="inline-flex items-center gap-1 rounded hover:bg-[var(--studio-bg-elevated)] px-0.5 -mx-0.5"
                aria-label="Configurar filtro"
              >
                <Pencil className="h-3 w-3 text-[var(--studio-fg-muted)]" />
                {gf.label || gf.field}
              </button>
            ) : (
              <span>{gf.label || gf.field}</span>
            )}
            {isDesign ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFilter(gf.id);
                }}
                className="ml-0.5 rounded p-0.5 hover:bg-red-500/20 hover:text-red-400"
                aria-label="Quitar filtro"
              >
                ×
              </button>
            ) : null}
          </span>
        ))
      )}

      {isDesign ? (
        <>
          <select
            className="h-7 rounded-md border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 text-xs text-[var(--studio-fg)]"
            value=""
            onChange={(e) => {
              const value = e.target.value;
              e.target.value = "";
              if (value) onAddFilter(value);
            }}
            aria-label="Añadir filtro global"
          >
            <option value="">+ Filtro</option>
            {filterFieldOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onAddImage}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs font-medium text-[var(--studio-fg)] hover:bg-[var(--studio-bg-elevated)]"
          >
            <ImageIcon className="h-3.5 w-3.5" aria-hidden />
            Imagen
          </button>
        </>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {isDesign && etlId ? (
          <Link
            href={`/admin/etl/${etlId}/metrics`}
            className="hidden text-xs font-medium text-[var(--studio-accent)] hover:underline sm:inline"
          >
            Métricas ETL
          </Link>
        ) : null}
        {isDesign ? (
          <button
            type="button"
            onClick={onToggleSettings}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
              settingsOpen
                ? "border-[var(--studio-accent)] bg-[var(--studio-accent-dim)] text-[var(--studio-accent)]"
                : "border-[var(--studio-border)] bg-[var(--studio-surface)] text-[var(--studio-fg-muted)] hover:text-[var(--studio-fg)]"
            )}
            aria-expanded={settingsOpen}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Configuración
          </button>
        ) : null}
      </div>
    </div>
  );
}
