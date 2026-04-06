"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DashboardTheme } from "@/types/dashboard";

export const FONT_FAMILY_OPTIONS: { value: string; label: string }[] = [
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

export const DASHBOARD_THEME_FORM_DEFAULT_FONT = FONT_FAMILY_OPTIONS[0]!.value;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function normalizeHexColor(value: string): string | undefined {
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

function colorPickerValue(value: string | undefined, fallback: string): string {
  return normalizeHexColor(value ?? "") ?? fallback;
}

export type DashboardThemeFormScope = "global" | "card";

export type DashboardThemeFormSectionsProps = {
  value: DashboardTheme;
  onPatch: (patch: Partial<DashboardTheme>) => void;
  scope: DashboardThemeFormScope;
  labelClassName: string;
  inputClassName: string;
};

export function mergeCardThemePatch(
  prev: Partial<DashboardTheme> | undefined,
  patch: Partial<DashboardTheme>
): Partial<DashboardTheme> | undefined {
  const base: Partial<DashboardTheme> = { ...(prev ?? {}) };
  for (const key of Object.keys(patch) as (keyof DashboardTheme)[]) {
    const v = patch[key];
    if (v === undefined) delete base[key];
    else (base as Record<string, unknown>)[key as string] = v;
  }
  return Object.keys(base).length > 0 ? base : undefined;
}

export function DashboardThemeFormSections({
  value,
  onPatch,
  scope,
  labelClassName,
  inputClassName,
}: DashboardThemeFormSectionsProps) {
  const [textColorDraft, setTextColorDraft] = useState(value.textColor ?? "");
  const [textMutedDraft, setTextMutedDraft] = useState(value.textMutedColor ?? "");

  useEffect(() => {
    setTextColorDraft(value.textColor ?? "");
  }, [value.textColor]);

  useEffect(() => {
    setTextMutedDraft(value.textMutedColor ?? "");
  }, [value.textMutedColor]);

  const canvasBgLabel = scope === "card" ? "Fondo de la celda (color)" : "Fondo (color)";
  const canvasImgLabel = scope === "card" ? "Imagen de fondo de la celda (URL)" : "Foto de fondo (URL)";

  const sectionTitle = "text-xs font-semibold uppercase tracking-wide text-[var(--studio-fg-muted)]";
  const grid = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="space-y-6">
      <div className="space-y-3 border-t border-[var(--studio-border)] pt-4 first:border-t-0 first:pt-0">
        <h4 className={sectionTitle}>Lienzo</h4>
        <div className={grid}>
          <div>
            <Label className={labelClassName}>{canvasBgLabel}</Label>
            <div className="mt-1 flex gap-2">
              <input
                type="color"
                value={colorPickerValue(value.backgroundColor, "#111318")}
                onChange={(e) => onPatch({ backgroundColor: e.target.value })}
                className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--studio-border)] bg-transparent"
              />
              <Input
                value={value.backgroundColor ?? ""}
                onChange={(e) => onPatch({ backgroundColor: e.target.value.trim() ? e.target.value : undefined })}
                className={`${inputClassName} flex-1 font-mono text-xs`}
                placeholder="#111318"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label className={labelClassName}>{canvasImgLabel}</Label>
            <Input
              value={value.backgroundImageUrl ?? ""}
              onChange={(e) => onPatch({ backgroundImageUrl: e.target.value.trim() ? e.target.value : undefined })}
              className={`${inputClassName} mt-1`}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-[var(--studio-border)] pt-4">
        <h4 className={sectionTitle}>Tarjetas (predeterminado)</h4>
        <div className={grid}>
          <div>
            <Label className={labelClassName}>Acento (gráficos)</Label>
            <div className="mt-1 flex gap-2">
              {normalizeHexColor(value.accentColor ?? "") ? (
                <input
                  type="color"
                  value={colorPickerValue(value.accentColor, "#2dd4bf")}
                  onChange={(e) => onPatch({ accentColor: normalizeHexColor(e.target.value) ?? e.target.value })}
                  className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--studio-border)] bg-transparent"
                />
              ) : null}
              <Input
                value={value.accentColor ?? ""}
                onChange={(e) => onPatch({ accentColor: e.target.value.trim() ? e.target.value : undefined })}
                className={`${inputClassName} flex-1 font-mono text-xs`}
                placeholder="#14b8a6"
              />
            </div>
          </div>
          <div>
            <Label className={labelClassName}>Color de tarjetas</Label>
            <div className="mt-1 flex gap-2">
              <input
                type="color"
                value={colorPickerValue(value.cardBackgroundColor, "#ffffff")}
                onChange={(e) => onPatch({ cardBackgroundColor: e.target.value })}
                className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--studio-border)] bg-transparent"
              />
              <Input
                value={value.cardBackgroundColor ?? ""}
                onChange={(e) => onPatch({ cardBackgroundColor: e.target.value.trim() ? e.target.value : undefined })}
                className={`${inputClassName} flex-1 font-mono text-xs`}
                placeholder="rgba(255,255,255,0.03)"
              />
            </div>
          </div>
          <div>
            <Label className={labelClassName}>Texto principal</Label>
            <div className="mt-1 flex gap-2">
              {normalizeHexColor(textColorDraft) ? (
                <input
                  type="color"
                  value={colorPickerValue(textColorDraft, "#ffffff")}
                  onChange={(e) => {
                    const next = normalizeHexColor(e.target.value) ?? "#ffffff";
                    setTextColorDraft(next);
                    onPatch({ textColor: next });
                  }}
                  className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--studio-border)] bg-transparent"
                />
              ) : null}
              <Input
                value={textColorDraft}
                onChange={(e) => setTextColorDraft(e.target.value)}
                onBlur={() => onPatch({ textColor: textColorDraft.trim() ? textColorDraft.trim() : undefined })}
                className={`${inputClassName} flex-1 font-mono text-xs`}
                placeholder="#ffffff o rgba(...)"
              />
            </div>
          </div>
          <div>
            <Label className={labelClassName}>Texto secundario</Label>
            <div className="mt-1 flex gap-2">
              {normalizeHexColor(textMutedDraft) ? (
                <input
                  type="color"
                  value={colorPickerValue(textMutedDraft, "#bfbfbf")}
                  onChange={(e) => {
                    const next = normalizeHexColor(e.target.value) ?? "#bfbfbf";
                    setTextMutedDraft(next);
                    onPatch({ textMutedColor: next });
                  }}
                  className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--studio-border)] bg-transparent"
                />
              ) : null}
              <Input
                value={textMutedDraft}
                onChange={(e) => setTextMutedDraft(e.target.value)}
                onBlur={() => onPatch({ textMutedColor: textMutedDraft.trim() ? textMutedDraft.trim() : undefined })}
                className={`${inputClassName} flex-1 font-mono text-xs`}
                placeholder="rgba(255,255,255,0.75)"
              />
            </div>
          </div>
          <div>
            <Label className={labelClassName}>Borde tarjetas (color)</Label>
            <div className="mt-1 flex gap-2">
              <input
                type="color"
                value={colorPickerValue(value.cardBorderColor, "#e2e8f0")}
                onChange={(e) => onPatch({ cardBorderColor: e.target.value })}
                className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--studio-border)] bg-transparent"
              />
              <Input
                value={value.cardBorderColor ?? ""}
                onChange={(e) => onPatch({ cardBorderColor: e.target.value.trim() ? e.target.value : undefined })}
                className={`${inputClassName} flex-1 font-mono text-xs`}
                placeholder="rgba(255,255,255,0.08)"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
            <div>
              <Label className={labelClassName}>Grosor borde (px)</Label>
              <Input
                type="number"
                min={0}
                max={8}
                value={value.cardBorderWidth ?? 1}
                onChange={(e) =>
                  onPatch({ cardBorderWidth: e.target.value ? parseInt(e.target.value, 10) : undefined })
                }
                className={`${inputClassName} mt-1`}
              />
            </div>
            <div>
              <Label className={labelClassName}>Radio bordes (px)</Label>
              <Input
                type="number"
                min={0}
                max={32}
                value={value.cardBorderRadius ?? 20}
                onChange={(e) =>
                  onPatch({ cardBorderRadius: e.target.value ? parseInt(e.target.value, 10) : undefined })
                }
                className={`${inputClassName} mt-1`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-[var(--studio-border)] pt-4">
        <h4 className={sectionTitle}>Tipografía y tamaños</h4>
        <div className={grid}>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label className={labelClassName}>Familia tipográfica</Label>
            <select
              value={
                FONT_FAMILY_OPTIONS.some((f) => f.value === (value.fontFamily ?? ""))
                  ? (value.fontFamily ?? DASHBOARD_THEME_FORM_DEFAULT_FONT)
                  : value.fontFamily || DASHBOARD_THEME_FORM_DEFAULT_FONT
              }
              onChange={(e) => onPatch({ fontFamily: e.target.value || DASHBOARD_THEME_FORM_DEFAULT_FONT })}
              className={`${inputClassName} mt-1 w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm text-[var(--studio-fg)]`}
            >
              {FONT_FAMILY_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
              {value.fontFamily && !FONT_FAMILY_OPTIONS.some((f) => f.value === value.fontFamily) && (
                <option value={value.fontFamily}>Personalizado</option>
              )}
            </select>
          </div>
          <div>
            <Label className={labelClassName}>Título dashboard (rem)</Label>
            <Input
              type="number"
              min={0.75}
              max={2}
              step={0.125}
              value={value.headerFontSize ?? 1.25}
              onChange={(e) =>
                onPatch({ headerFontSize: e.target.value ? parseFloat(e.target.value) : undefined })
              }
              className={`${inputClassName} mt-1`}
            />
          </div>
          <div>
            <Label className={labelClassName}>Título tarjeta (rem)</Label>
            <Input
              type="number"
              min={0.5}
              max={1.5}
              step={0.0625}
              value={value.cardTitleFontSize ?? 0.8125}
              onChange={(e) =>
                onPatch({ cardTitleFontSize: e.target.value ? parseFloat(e.target.value) : undefined })
              }
              className={`${inputClassName} mt-1`}
            />
          </div>
          <div>
            <Label className={labelClassName}>Valor KPI (rem)</Label>
            <Input
              type="number"
              min={0.75}
              max={3}
              step={0.125}
              value={value.kpiValueFontSize ?? 1.25}
              onChange={(e) =>
                onPatch({ kpiValueFontSize: e.target.value ? parseFloat(e.target.value) : undefined })
              }
              className={`${inputClassName} mt-1`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
