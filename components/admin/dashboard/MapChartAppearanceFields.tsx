"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  MAP_VISUAL_DEFAULTS,
  type MapValueEncoding,
  type MapVisualConfigInput,
} from "@/lib/dashboard/mapVisualScale";

export type MapChartAppearanceFieldsProps = {
  agg: MapVisualConfigInput;
  /** Recibe solo campos de mapa; compatible con updateAgg del panel de métricas. */
  updateAgg: (patch: MapVisualConfigInput) => void;
  /** Clases opcionales para inputs (studio vs ETL). */
  inputClassName?: string;
  labelClassName?: string;
  /** `platform`: tokens --platform-* (formulario ETL). */
  theme?: "studio" | "platform";
};

const ENCODING_OPTIONS: { value: MapValueEncoding; label: string; hint: string }[] = [
  { value: "both", label: "Color y tamaño", hint: "El valor modifica color y radio del punto." },
  { value: "color", label: "Solo color", hint: "Radio fijo; la intensidad va en color y opacidad." },
  { value: "size", label: "Solo tamaño", hint: "Color uniforme; el valor modifica el radio." },
];

export function MapChartAppearanceFields({
  agg,
  updateAgg,
  inputClassName,
  labelClassName,
  theme = "studio",
}: MapChartAppearanceFieldsProps) {
  const isPlatform = theme === "platform";
  const borderVar = isPlatform ? "var(--platform-border)" : "var(--studio-border)";
  const surfaceVar = isPlatform ? "var(--platform-bg)" : "var(--studio-surface)";
  const fgVar = isPlatform ? "var(--platform-fg)" : "var(--studio-fg)";
  const mutedVar = isPlatform ? "var(--platform-fg-muted)" : "var(--studio-fg-muted)";
  const resolvedInputClass =
    inputClassName ??
    (isPlatform
      ? "h-9 rounded-xl border text-sm"
      : "h-8 rounded-lg border-[var(--studio-border)] text-xs");
  const resolvedLabelClass = labelClassName ?? `text-[11px] ${isPlatform ? "text-[var(--platform-fg-muted)]" : "text-[var(--studio-fg-muted)]"}`;

  const enc = (agg.mapValueEncoding as MapValueEncoding | undefined) ?? MAP_VISUAL_DEFAULTS.mapValueEncoding;
  const colorLow = agg.mapColorLow ?? MAP_VISUAL_DEFAULTS.mapColorLow;
  const colorHigh = agg.mapColorHigh ?? MAP_VISUAL_DEFAULTS.mapColorHigh;
  const emptyColor = agg.mapChoroplethEmptyColor ?? MAP_VISUAL_DEFAULTS.mapChoroplethEmptyColor;

  return (
    <div className="space-y-3">
      <div>
        <Label className={resolvedLabelClass}>Codificación según valor</Label>
        <select
          value={enc}
          onChange={(e) =>
            updateAgg({
              mapValueEncoding: e.target.value as MapValueEncoding,
            })
          }
          className="mt-1 w-full rounded-lg border px-2 py-2 text-xs"
          style={{
            borderColor: borderVar,
            background: surfaceVar,
            color: fgVar,
          }}
        >
          {ENCODING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px]" style={{ color: mutedVar }}>
          {ENCODING_OPTIONS.find((o) => o.value === enc)?.hint}
        </p>
        <p className="mt-1 text-[10px]" style={{ color: mutedVar }}>
          En mapa por provincias (Argentina), sin tamaño: con «solo tamaño» la magnitud se muestra con opacidad del relleno.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className={resolvedLabelClass}>Color valor bajo</Label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={colorLow}
              onChange={(e) => updateAgg({ mapColorLow: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border"
              style={{ borderColor: borderVar }}
            />
            <Input
              value={agg.mapColorLow ?? ""}
              onChange={(e) => updateAgg({ mapColorLow: e.target.value || undefined })}
              className={`font-mono ${resolvedInputClass}`}
              style={
                isPlatform
                  ? { borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }
                  : undefined
              }
              placeholder={MAP_VISUAL_DEFAULTS.mapColorLow}
            />
          </div>
        </div>
        <div>
          <Label className={resolvedLabelClass}>Color valor alto</Label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={colorHigh}
              onChange={(e) => updateAgg({ mapColorHigh: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border"
              style={{ borderColor: borderVar }}
            />
            <Input
              value={agg.mapColorHigh ?? ""}
              onChange={(e) => updateAgg({ mapColorHigh: e.target.value || undefined })}
              className={`font-mono ${resolvedInputClass}`}
              style={
                isPlatform
                  ? { borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }
                  : undefined
              }
              placeholder={MAP_VISUAL_DEFAULTS.mapColorHigh}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className={resolvedLabelClass}>Radio mín. (px)</Label>
          <Input
            type="number"
            min={1}
            max={80}
            value={agg.mapRadiusMin ?? ""}
            onChange={(e) =>
              updateAgg({
                mapRadiusMin: e.target.value ? parseInt(e.target.value, 10) : undefined,
              })
            }
            className={`mt-0.5 ${resolvedInputClass}`}
            style={
              isPlatform
                ? { borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }
                : undefined
            }
            placeholder={String(MAP_VISUAL_DEFAULTS.mapRadiusMin)}
          />
        </div>
        <div>
          <Label className={resolvedLabelClass}>Radio máx. (px)</Label>
          <Input
            type="number"
            min={1}
            max={80}
            value={agg.mapRadiusMax ?? ""}
            onChange={(e) =>
              updateAgg({
                mapRadiusMax: e.target.value ? parseInt(e.target.value, 10) : undefined,
              })
            }
            className={`mt-0.5 ${resolvedInputClass}`}
            style={
              isPlatform
                ? { borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }
                : undefined
            }
            placeholder={String(MAP_VISUAL_DEFAULTS.mapRadiusMax)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className={resolvedLabelClass}>Opacidad relleno mín.</Label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={agg.mapFillOpacityMin ?? ""}
            onChange={(e) =>
              updateAgg({
                mapFillOpacityMin: e.target.value !== "" ? Number(e.target.value) : undefined,
              })
            }
            className={`mt-0.5 ${resolvedInputClass}`}
            style={
              isPlatform
                ? { borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }
                : undefined
            }
            placeholder={String(MAP_VISUAL_DEFAULTS.mapFillOpacityMin)}
          />
        </div>
        <div>
          <Label className={resolvedLabelClass}>Opacidad relleno máx.</Label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={agg.mapFillOpacityMax ?? ""}
            onChange={(e) =>
              updateAgg({
                mapFillOpacityMax: e.target.value !== "" ? Number(e.target.value) : undefined,
              })
            }
            className={`mt-0.5 ${resolvedInputClass}`}
            style={
              isPlatform
                ? { borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }
                : undefined
            }
            placeholder={String(MAP_VISUAL_DEFAULTS.mapFillOpacityMax)}
          />
        </div>
      </div>

      <div>
        <Label className={resolvedLabelClass}>Grosor borde del punto (px)</Label>
        <Input
          type="number"
          min={0}
          max={6}
          step={0.5}
          value={agg.mapStrokeWidth ?? ""}
          onChange={(e) =>
            updateAgg({
              mapStrokeWidth: e.target.value !== "" ? Number(e.target.value) : undefined,
            })
          }
          className={`mt-0.5 max-w-[8rem] ${resolvedInputClass}`}
          style={
            isPlatform
              ? { borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }
              : undefined
          }
          placeholder={String(MAP_VISUAL_DEFAULTS.mapStrokeWidth)}
        />
      </div>

      <div>
        <Label className={resolvedLabelClass}>Coropleto — provincia sin dato</Label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="color"
            value={emptyColor}
            onChange={(e) => updateAgg({ mapChoroplethEmptyColor: e.target.value })}
            className="h-8 w-10 cursor-pointer rounded border"
            style={{ borderColor: borderVar }}
          />
          <Input
            value={agg.mapChoroplethEmptyColor ?? ""}
            onChange={(e) => updateAgg({ mapChoroplethEmptyColor: e.target.value || undefined })}
            className={`min-w-[7rem] flex-1 font-mono ${resolvedInputClass}`}
            style={
              isPlatform
                ? { borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }
                : undefined
            }
            placeholder={MAP_VISUAL_DEFAULTS.mapChoroplethEmptyColor}
          />
        </div>
      </div>
    </div>
  );
}
