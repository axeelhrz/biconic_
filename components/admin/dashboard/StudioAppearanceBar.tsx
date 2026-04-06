"use client";

import { useState } from "react";
import { Palette, ChevronDown, ChevronUp } from "lucide-react";
import type { DashboardTheme } from "@/types/dashboard";
import { DashboardThemeFormSections } from "./DashboardThemeFormSections";

type StudioAppearanceBarProps = {
  theme: DashboardTheme;
  onThemeChange: (patch: Partial<DashboardTheme>) => void;
};

export function StudioAppearanceBar({ theme, onThemeChange }: StudioAppearanceBarProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="studio-appearance-bar border-b border-[var(--studio-border)] bg-[var(--studio-bg-elevated)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--studio-fg)]">
          <Palette className="h-4 w-4 text-[var(--studio-accent)]" />
          Apariencia del dashboard
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[var(--studio-muted)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--studio-muted)]" />
        )}
      </button>
      {open && (
        <div className="border-t border-[var(--studio-border)] p-4">
          <DashboardThemeFormSections
            scope="global"
            value={theme}
            onPatch={onThemeChange}
            labelClassName="studio-appearance-label"
            inputClassName="studio-appearance-input h-9"
          />
        </div>
      )}
    </div>
  );
}
