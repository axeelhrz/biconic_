"use client";

import { useEffect, useState } from "react";
import { Palette, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DashboardTheme } from "@/types/dashboard";

/** Fuentes disponibles en el desplegable (valor = font-family CSS completo). */
const FONT_FAMILY_OPTIONS: { value: string; label: string }[] = [
  { value: "'DM Sans', system-ui, -apple-system, sans-serif", label: "DM Sans" },
  { value: "Inter, system-ui, -apple-system, sans-serif", label: "Inter" },
  { value: "'Roboto', system-ui, sans-serif", label: "Roboto" },
  { value: "'Open Sans', system-ui, sans-serif", label: "Open Sans" },
  { value: "Lato, system-ui, sans-serif", label: "Lato" },
  { value: "'Poppins', system-ui, sans-serif", label: "Poppins" },
  { value: "'Source Sans 3', system-ui, sans-serif", label: "Source Sans 3" },
  { value: "'Nunito', system-ui, sans-serif", label: "Nunito" },
  { value: "'Work Sans', system-ui, sans-serif", label: "Work Sans" },
  { value: "'Plus Jakarta Sans', system-ui, sans-serif", label: "Plus Jakarta Sans" },
  { value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", label: "Sistema" },
];

const DEFAULT_FONT = FONT_FAMILY_OPTIONS[0]!.value;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DEFAULT_TEXT_COLOR = "#ffffff";
const DEFAULT_TEXT_MUTED_COLOR = "#bfbfbf";

function normalizeHexColor(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!HEX_COLOR_PATTERN.test(withHash)) return undefined;
  if (withHash.length === 4) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return withHash.toLowerCase();
}

function getColorPickerValue(value: string | undefined, fallback: string): string {
  const normalized = normalizeHexColor(value ?? "");
  return normalized ?? fallback;
}

type StudioAppearanceBarProps = {
  theme: DashboardTheme;
  onThemeChange: (patch: Partial<DashboardTheme>) => void;
};

export function StudioAppearanceBar({ theme, onThemeChange }: StudioAppearanceBarProps) {
  const [open, setOpen] = useState(true);
  const [textColorInput, setTextColorInput] = useState(theme.textColor ?? "");
  const [textMutedColorInput, setTextMutedColorInput] = useState(theme.textMutedColor ?? "");

  useEffect(() => {
    setTextColorInput(theme.textColor ?? "");
  }, [theme.textColor]);

  useEffect(() => {
    setTextMutedColorInput(theme.textMutedColor ?? "");
  }, [theme.textMutedColor]);

  const commitTextColor = (key: "textColor" | "textMutedColor", rawValue: string) => {
    const normalized = normalizeHexColor(rawValue);
    if (!rawValue.trim()) {
      onThemeChange({ [key]: undefined });
      return;
    }
    if (normalized) {
      onThemeChange({ [key]: normalized });
    }
  };

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
            <Label className="studio-appearance-label">Texto principal</Label>
            <div className="mt-1 flex gap-2">
              <input
                type="color"
                value={getColorPickerValue(theme.textColor, DEFAULT_TEXT_COLOR)}
                onChange={(e) => {
                  const next = normalizeHexColor(e.target.value) ?? DEFAULT_TEXT_COLOR;
                  setTextColorInput(next);
                  onThemeChange({ textColor: next });
                }}
                className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--studio-border)] bg-transparent"
              />
              <Input
                value={textColorInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setTextColorInput(value);
                  commitTextColor("textColor", value);
                }}
                onBlur={(e) => {
                  const normalized = normalizeHexColor(e.target.value);
                  setTextColorInput(normalized ?? (e.target.value.trim() ? (theme.textColor ?? "") : ""));
                }}
                className="studio-appearance-input h-9 flex-1 font-mono text-xs"
                placeholder="#ffffff"
              />
            </div>
          </div>
          <div>
            <Label className="studio-appearance-label">Texto secundario</Label>
            <div className="mt-1 flex gap-2">
              <input
                type="color"
                value={getColorPickerValue(theme.textMutedColor, DEFAULT_TEXT_MUTED_COLOR)}
                onChange={(e) => {
                  const next = normalizeHexColor(e.target.value) ?? DEFAULT_TEXT_MUTED_COLOR;
                  setTextMutedColorInput(next);
                  onThemeChange({ textMutedColor: next });
                }}
                className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--studio-border)] bg-transparent"
              />
              <Input
                value={textMutedColorInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setTextMutedColorInput(value);
                  commitTextColor("textMutedColor", value);
                }}
                onBlur={(e) => {
                  const normalized = normalizeHexColor(e.target.value);
                  setTextMutedColorInput(normalized ?? (e.target.value.trim() ? (theme.textMutedColor ?? "") : ""));
                }}
                className="studio-appearance-input h-9 flex-1 font-mono text-xs"
                placeholder="#bfbfbf"
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
            <select
              value={
                FONT_FAMILY_OPTIONS.some((f) => f.value === (theme.fontFamily ?? ""))
                  ? (theme.fontFamily ?? DEFAULT_FONT)
                  : theme.fontFamily || DEFAULT_FONT
              }
              onChange={(e) => onThemeChange({ fontFamily: e.target.value || DEFAULT_FONT })}
              className="studio-appearance-input mt-1 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm text-[var(--studio-fg)]"
            >
              {FONT_FAMILY_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
              {theme.fontFamily && !FONT_FAMILY_OPTIONS.some((f) => f.value === theme.fontFamily) && (
                <option value={theme.fontFamily}>Personalizado</option>
              )}
            </select>
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
