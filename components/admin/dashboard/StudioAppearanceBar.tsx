"use client";

import { useState } from "react";
import { Palette, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DashboardTheme } from "@/types/dashboard";

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
        <div className="grid gap-4 border-t border-[var(--studio-border)] p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div>
            <Label className="studio-appearance-label">Fondo (color)</Label>
            <div className="mt-1 flex gap-2">
              <input
                type="color"
                value={theme.backgroundColor ?? "#111318"}
                onChange={(e) => onThemeChange({ backgroundColor: e.target.value })}
                className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--studio-border)] bg-transparent"
              />
              <Input
                value={theme.backgroundColor ?? ""}
                onChange={(e) => onThemeChange({ backgroundColor: e.target.value || undefined })}
                className="studio-appearance-input h-9 flex-1 font-mono text-xs"
                placeholder="#111318"
              />
            </div>
          </div>
          <div>
            <Label className="studio-appearance-label">Foto de fondo (URL)</Label>
            <Input
              value={theme.backgroundImageUrl ?? ""}
              onChange={(e) => onThemeChange({ backgroundImageUrl: e.target.value || undefined })}
              className="studio-appearance-input mt-1"
              placeholder="https://..."
            />
          </div>
          <div>
            <Label className="studio-appearance-label">Color de tarjetas</Label>
            <div className="mt-1 flex gap-2">
              <input
                type="color"
                value={theme.cardBackgroundColor ?? "rgba(255,255,255,0.03)"}
                onChange={(e) => onThemeChange({ cardBackgroundColor: e.target.value })}
                className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--studio-border)] bg-transparent"
              />
              <Input
                value={theme.cardBackgroundColor ?? ""}
                onChange={(e) => onThemeChange({ cardBackgroundColor: e.target.value || undefined })}
                className="studio-appearance-input h-9 flex-1 font-mono text-xs"
                placeholder="rgba(255,255,255,0.03)"
              />
            </div>
          </div>
          <div>
            <Label className="studio-appearance-label">Borde tarjetas (color)</Label>
            <div className="mt-1 flex gap-2">
              <input
                type="color"
                value={theme.cardBorderColor ?? "rgba(255,255,255,0.08)"}
                onChange={(e) => onThemeChange({ cardBorderColor: e.target.value })}
                className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--studio-border)] bg-transparent"
              />
              <Input
                value={theme.cardBorderColor ?? ""}
                onChange={(e) => onThemeChange({ cardBorderColor: e.target.value || undefined })}
                className="studio-appearance-input h-9 flex-1 font-mono text-xs"
                placeholder="rgba(255,255,255,0.08)"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
            <div>
              <Label className="studio-appearance-label">Grosor borde (px)</Label>
              <Input
                type="number"
                min={0}
                max={8}
                value={theme.cardBorderWidth ?? 1}
                onChange={(e) =>
                  onThemeChange({ cardBorderWidth: e.target.value ? parseInt(e.target.value, 10) : undefined })
                }
                className="studio-appearance-input mt-1"
              />
            </div>
            <div>
              <Label className="studio-appearance-label">Radio bordes (px)</Label>
              <Input
                type="number"
                min={0}
                max={32}
                value={theme.cardBorderRadius ?? 20}
                onChange={(e) =>
                  onThemeChange({ cardBorderRadius: e.target.value ? parseInt(e.target.value, 10) : undefined })
                }
                className="studio-appearance-input mt-1"
              />
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label className="studio-appearance-label">Tipografía — familia</Label>
            <Input
              value={theme.fontFamily ?? ""}
              onChange={(e) => onThemeChange({ fontFamily: e.target.value || undefined })}
              className="studio-appearance-input mt-1"
              placeholder="'DM Sans', system-ui, sans-serif"
            />
          </div>
          <div>
            <Label className="studio-appearance-label">Título dashboard (rem)</Label>
            <Input
              type="number"
              min={0.75}
              max={2}
              step={0.125}
              value={theme.headerFontSize ?? 1.25}
              onChange={(e) =>
                onThemeChange({ headerFontSize: e.target.value ? parseFloat(e.target.value) : undefined })
              }
              className="studio-appearance-input mt-1"
            />
          </div>
          <div>
            <Label className="studio-appearance-label">Título tarjeta (rem)</Label>
            <Input
              type="number"
              min={0.5}
              max={1.5}
              step={0.0625}
              value={theme.cardTitleFontSize ?? 0.8125}
              onChange={(e) =>
                onThemeChange({ cardTitleFontSize: e.target.value ? parseFloat(e.target.value) : undefined })
              }
              className="studio-appearance-input mt-1"
            />
          </div>
          <div>
            <Label className="studio-appearance-label">Valor KPI (rem)</Label>
            <Input
              type="number"
              min={0.75}
              max={3}
              step={0.125}
              value={theme.kpiValueFontSize ?? 1.25}
              onChange={(e) =>
                onThemeChange({ kpiValueFontSize: e.target.value ? parseFloat(e.target.value) : undefined })
              }
              className="studio-appearance-input mt-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}
