"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  MAP_CHOROPLETH_PALETTES,
  MAP_VISUAL_DEFAULTS,
  mapColorStopsToCssGradient,
  resolveMapVisualStyle,
  type MapChoroplethPaletteId,
  type MapChoroplethScaleMode,
  type MapDisplayMode,
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

const PALETTE_OPTIONS: { value: MapChoroplethPaletteId; label: string }[] = [
  { value: "ocean", label: "Azul océano" },
  { value: "emerald", label: "Verde esmeralda" },
  { value: "sunset", label: "Atardecer" },
  { value: "violet", label: "Violeta" },
  { value: "custom", label: "Personalizado" },
];

const SCALE_OPTIONS: { value: MapChoroplethScaleMode; label: string }[] = [
  { value: "log", label: "Logarítmica (recomendada para montos)" },
  { value: "linear", label: "Lineal" },
  { value: "sqrt", label: "Raíz cuadrada" },
];

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

  const displayDefault = agg.mapDisplayModeDefault ?? "choropleth";
  const enc = (agg.mapValueEncoding as MapValueEncoding | undefined) ?? MAP_VISUAL_DEFAULTS.mapValueEncoding;
  const colorLow = agg.mapColorLow ?? MAP_VISUAL_DEFAULTS.mapColorLow;
  const colorHigh = agg.mapColorHigh ?? MAP_VISUAL_DEFAULTS.mapColorHigh;
  const emptyColor = agg.mapChoroplethEmptyColor ?? MAP_VISUAL_DEFAULTS.mapChoroplethEmptyColor;
  const showLabels = agg.mapChoroplethShowLabels ?? MAP_VISUAL_DEFAULTS.mapChoroplethShowLabels;
  const showLegend = agg.mapChoroplethShowLegend ?? MAP_VISUAL_DEFAULTS.mapChoroplethShowLegend;
  const hideBaseMap = agg.mapChoroplethHideBaseMap ?? MAP_VISUAL_DEFAULTS.mapChoroplethHideBaseMap;
  const showMarkerRadius = displayDefault !== "choropleth";

  const resolvedPalette =
    (agg.mapChoroplethPalette as MapChoroplethPaletteId | undefined) ?? MAP_VISUAL_DEFAULTS.mapChoroplethPalette;
  const scaleMode = (agg.mapChoroplethScaleMode as MapChoroplethScaleMode | undefined) ?? MAP_VISUAL_DEFAULTS.mapChoroplethScaleMode;
  const resolvedStyle = resolveMapVisualStyle(agg);
  const gradientPreview = mapColorStopsToCssGradient(resolvedStyle.colorStops, "to right");
  const isCustomPalette = resolvedPalette === "custom";
  const labelSize = agg.mapChoroplethLabelSize ?? MAP_VISUAL_DEFAULTS.mapChoroplethLabelSize;

  const applyPalette = (id: MapChoroplethPaletteId) => {
    if (id === "custom") {
      updateAgg({ mapChoroplethPalette: "custom" });
      return;
    }
    const stops = MAP_CHOROPLETH_PALETTES[id];
    updateAgg({
      mapChoroplethPalette: id,
      mapColorStops: stops,
      mapColorLow: stops[0],
      mapColorHigh: stops[stops.length - 1],
      mapColorMid: stops.length >= 3 ? stops[Math.floor(stops.length / 2)] : undefined,
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className={resolvedLabelClass}>Vista del mapa</Label>
        <select
          value={displayDefault}
          onChange={(e) => {
            const v = e.target.value;
            updateAgg({
              mapDisplayModeDefault:
                v === "markers" || v === "choropleth" ? (v as MapDisplayMode) : "choropleth",
            });
          }}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-xs"
          style={{
            borderColor: borderVar,
            background: surfaceVar,
            color: fgVar,
          }}
        >
          <option value="choropleth">Provincias coloreadas (recomendado)</option>
          <option value="markers">Puntos (círculos)</option>
        </select>
        <p className="mt-1 text-[10px]" style={{ color: mutedVar }}>
          Con país por defecto Argentina, el mapa muestra provincias coloreadas según la métrica. El visitante puede cambiar a puntos desde el control en la esquina del mapa.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-xs" style={{ color: fgVar }}>
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => updateAgg({ mapChoroplethShowLabels: e.target.checked })}
          />
          Etiquetas de provincia
        </label>
        <label className="flex items-center gap-2 text-xs" style={{ color: fgVar }}>
          <input
            type="checkbox"
            checked={showLegend}
            onChange={(e) => updateAgg({ mapChoroplethShowLegend: e.target.checked })}
          />
          Leyenda de valores
        </label>
        <label className="flex items-center gap-2 text-xs" style={{ color: fgVar }}>
          <input
            type="checkbox"
            checked={hideBaseMap}
            onChange={(e) => updateAgg({ mapChoroplethHideBaseMap: e.target.checked })}
          />
          Fondo limpio (sin calles)
        </label>
      </div>

      <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: borderVar }}>
        <Label className={resolvedLabelClass}>Escala de color del mapa</Label>
        <div>
          <Label className={`${resolvedLabelClass} mt-1`}>Paleta</Label>
          <select
            value={resolvedPalette}
            onChange={(e) => applyPalette(e.target.value as MapChoroplethPaletteId)}
            className="mt-1 w-full rounded-lg border px-2 py-2 text-xs"
            style={{ borderColor: borderVar, background: surfaceVar, color: fgVar }}
          >
            {PALETTE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className={`${resolvedLabelClass} mt-1`}>Escala de valores</Label>
          <select
            value={scaleMode}
            onChange={(e) =>
              updateAgg({ mapChoroplethScaleMode: e.target.value as MapChoroplethScaleMode })
            }
            className="mt-1 w-full rounded-lg border px-2 py-2 text-xs"
            style={{ borderColor: borderVar, background: surfaceVar, color: fgVar }}
          >
            {SCALE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div
          className="mt-1 h-3 w-full rounded-full border"
          style={{ borderColor: borderVar, background: gradientPreview }}
          title="Vista previa del gradiente"
        />
        {isCustomPalette ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <Label className={resolvedLabelClass}>Color bajo</Label>
              <input
                type="color"
                value={colorLow}
                onChange={(e) =>
                  updateAgg({
                    mapColorLow: e.target.value,
                    mapChoroplethPalette: "custom",
                    mapColorStops: undefined,
                  })
                }
                className="mt-1 h-8 w-full cursor-pointer rounded border"
                style={{ borderColor: borderVar }}
              />
            </div>
            <div>
              <Label className={resolvedLabelClass}>Color medio</Label>
              <input
                type="color"
                value={agg.mapColorMid ?? colorLow}
                onChange={(e) =>
                  updateAgg({
                    mapColorMid: e.target.value,
                    mapChoroplethPalette: "custom",
                    mapColorStops: undefined,
                  })
                }
                className="mt-1 h-8 w-full cursor-pointer rounded border"
                style={{ borderColor: borderVar }}
              />
            </div>
            <div>
              <Label className={resolvedLabelClass}>Color alto</Label>
              <input
                type="color"
                value={colorHigh}
                onChange={(e) =>
                  updateAgg({
                    mapColorHigh: e.target.value,
                    mapChoroplethPalette: "custom",
                    mapColorStops: undefined,
                  })
                }
                className="mt-1 h-8 w-full cursor-pointer rounded border"
                style={{ borderColor: borderVar }}
              />
            </div>
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-xs" style={{ color: fgVar }}>
          <span>Tamaño etiquetas:</span>
          <select
            value={labelSize}
            onChange={(e) =>
              updateAgg({ mapChoroplethLabelSize: e.target.value as "sm" | "md" })
            }
            className="rounded border px-2 py-1 text-xs"
            style={{ borderColor: borderVar, background: surfaceVar, color: fgVar }}
          >
            <option value="sm">Pequeño</option>
            <option value="md">Mediano</option>
          </select>
        </label>
      </div>

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

      {showMarkerRadius ? (
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
      ) : null}

      {showMarkerRadius ? (
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
      ) : null}

      {showMarkerRadius ? (
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
      ) : (
      <div>
        <Label className={resolvedLabelClass}>Grosor borde entre provincias (px)</Label>
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
      )}

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
        <Label className={resolvedLabelClass}>Provincias — sin dato</Label>
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
