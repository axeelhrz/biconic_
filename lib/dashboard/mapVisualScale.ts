/**
 * Escala visual del mapa (marcadores y coropleto): color, radio y opacidad según valor.
 */

export type MapValueEncoding = "both" | "color" | "size";

/** Vista del mapa: puntos (círculos) o provincias coloreadas (solo Argentina). */
export type MapDisplayMode = "markers" | "choropleth";

/** Escala de intensidad para coropleta. */
export type MapChoroplethScaleMode = "linear" | "log" | "sqrt";

/** Presets de paleta multicolor para coropleta. */
export type MapChoroplethPaletteId = "ocean" | "emerald" | "sunset" | "violet" | "custom";

export type MapChoroplethLabelSize = "sm" | "md";

export type MapVisualConfigInput = {
  /** Modo inicial al abrir el mapa; el visitante puede cambiarlo en el visor. */
  mapDisplayModeDefault?: MapDisplayMode;
  mapValueEncoding?: MapValueEncoding;
  mapColorLow?: string;
  mapColorMid?: string;
  mapColorHigh?: string;
  /** Paradas de color (3–5 hex). Si está definido, tiene prioridad sobre low/mid/high. */
  mapColorStops?: string[];
  mapChoroplethPalette?: MapChoroplethPaletteId;
  mapChoroplethScaleMode?: MapChoroplethScaleMode;
  mapRadiusMin?: number;
  mapRadiusMax?: number;
  mapFillOpacityMin?: number;
  mapFillOpacityMax?: number;
  mapStrokeWidth?: number;
  mapChoroplethEmptyColor?: string;
  /** Coropleta: mostrar nombre de provincia en el polígono. */
  mapChoroplethShowLabels?: boolean;
  /** Coropleta: leyenda de escala (mín–máx). */
  mapChoroplethShowLegend?: boolean;
  /** Coropleta: ocultar capa de calles (fondo limpio). */
  mapChoroplethHideBaseMap?: boolean;
  mapChoroplethLabelSize?: MapChoroplethLabelSize;
};

/** Paletas predefinidas para coropleta (bajo → alto). */
export const MAP_CHOROPLETH_PALETTES: Record<Exclude<MapChoroplethPaletteId, "custom">, string[]> = {
  ocean: ["#e0f2fe", "#38bdf8", "#0284c7", "#0c4a6e"],
  emerald: ["#ecfdf5", "#6ee7b7", "#10b981", "#065f46"],
  sunset: ["#fff7ed", "#fdba74", "#f97316", "#9a3412"],
  violet: ["#f5f3ff", "#c4b5fd", "#7c3aed", "#4c1d95"],
};

/** Defaults alineados con el comportamiento histórico (HSL 199, radios 5–14). */
export const MAP_VISUAL_DEFAULTS = {
  mapValueEncoding: "both" as MapValueEncoding,
  mapColorLow: "#7ec8ef",
  mapColorHigh: "#0f6fa8",
  mapRadiusMin: 5,
  mapRadiusMax: 14,
  mapFillOpacityMin: 0.4,
  mapFillOpacityMax: 0.85,
  mapStrokeWidth: 1.5,
  mapChoroplethEmptyColor: "#e8edf3",
  mapChoroplethShowLabels: true,
  mapChoroplethShowLegend: true,
  mapChoroplethHideBaseMap: true,
  mapChoroplethScaleMode: "log" as MapChoroplethScaleMode,
  mapChoroplethPalette: "ocean" as MapChoroplethPaletteId,
  mapChoroplethLabelSize: "md" as MapChoroplethLabelSize,
  choroplethFillOpacityMin: 0.92,
  choroplethFillOpacityMax: 1,
} as const;

export type ResolvedMapVisualStyle = {
  encoding: MapValueEncoding;
  colorLow: string;
  colorMid: string | null;
  colorHigh: string;
  colorStops: string[];
  choroplethScaleMode: MapChoroplethScaleMode;
  choroplethPalette: MapChoroplethPaletteId;
  radiusMin: number;
  radiusMax: number;
  fillOpacityMin: number;
  fillOpacityMax: number;
  choroplethFillOpacityMin: number;
  choroplethFillOpacityMax: number;
  strokeWidth: number;
  choroplethEmptyColor: string;
  choroplethShowLabels: boolean;
  choroplethShowLegend: boolean;
  choroplethHideBaseMap: boolean;
  choroplethLabelSize: MapChoroplethLabelSize;
};

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  const raw = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(raw)) return null;
  if (raw.length === 3) {
    return {
      r: parseInt(raw[0]! + raw[0]!, 16),
      g: parseInt(raw[1]! + raw[1]!, 16),
      b: parseInt(raw[2]! + raw[2]!, 16),
    };
  }
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Interpola entre dos hex; si falla el parseo, devuelve high. */
export function interpolateMapColor(lowHex: string, highHex: string, t: number): string {
  const a = parseHexColor(lowHex);
  const b = parseHexColor(highHex);
  if (!a || !b) return highHex.trim() || MAP_VISUAL_DEFAULTS.mapColorHigh;
  const u = clamp01(t);
  return rgbToHex(a.r + (b.r - a.r) * u, a.g + (b.g - a.g) * u, a.b + (b.b - a.b) * u);
}

/** Interpola entre N paradas de color (3–5). */
export function interpolateMapColorStops(stops: string[], t: number): string {
  const valid = stops.map((s) => s.trim()).filter((s) => parseHexColor(s));
  if (valid.length === 0) return MAP_VISUAL_DEFAULTS.mapColorHigh;
  if (valid.length === 1) return valid[0]!;
  const u = clamp01(t);
  const seg = u * (valid.length - 1);
  const i = Math.min(valid.length - 2, Math.floor(seg));
  const localT = seg - i;
  return interpolateMapColor(valid[i]!, valid[i + 1]!, localT);
}

/** CSS linear-gradient para las paradas de color. */
export function mapColorStopsToCssGradient(stops: string[], direction: "to right" | "to top" = "to right"): string {
  const valid = stops.filter((s) => parseHexColor(s));
  if (valid.length === 0) return MAP_VISUAL_DEFAULTS.mapColorHigh;
  if (valid.length === 1) return valid[0]!;
  const pct = valid.map((c, i) => {
    const p = valid.length === 1 ? 0 : (i / (valid.length - 1)) * 100;
    return `${c} ${p}%`;
  });
  return `linear-gradient(${direction}, ${pct.join(", ")})`;
}

/** Luminancia relativa 0–1 para elegir color de texto sobre un fondo. */
export function mapColorLuminance(hex: string): number {
  const c = parseHexColor(hex);
  if (!c) return 0.5;
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function normalizeEncoding(raw: unknown): MapValueEncoding {
  if (raw === "color" || raw === "size" || raw === "both") return raw;
  return MAP_VISUAL_DEFAULTS.mapValueEncoding;
}

function normalizeScaleMode(raw: unknown): MapChoroplethScaleMode {
  if (raw === "linear" || raw === "log" || raw === "sqrt") return raw;
  return MAP_VISUAL_DEFAULTS.mapChoroplethScaleMode;
}

function normalizePalette(raw: unknown): MapChoroplethPaletteId {
  if (raw === "ocean" || raw === "emerald" || raw === "sunset" || raw === "violet" || raw === "custom") return raw;
  return MAP_VISUAL_DEFAULTS.mapChoroplethPalette;
}

function normalizeLabelSize(raw: unknown): MapChoroplethLabelSize {
  if (raw === "sm" || raw === "md") return raw;
  return MAP_VISUAL_DEFAULTS.mapChoroplethLabelSize;
}

function finiteOr(defaultVal: number, v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : defaultVal;
}

function pickColorStopsFromCfg(cfg?: MapVisualConfigInput | null): string[] {
  const rawStops = Array.isArray(cfg?.mapColorStops)
    ? cfg!.mapColorStops!.map((s) => String(s).trim()).filter((s) => parseHexColor(s))
    : [];
  if (rawStops.length >= 2) return rawStops.slice(0, 5);

  const palette = normalizePalette(cfg?.mapChoroplethPalette);
  if (palette !== "custom") return [...MAP_CHOROPLETH_PALETTES[palette]];

  const low = String(cfg?.mapColorLow ?? "").trim() || MAP_VISUAL_DEFAULTS.mapColorLow;
  const mid = String(cfg?.mapColorMid ?? "").trim();
  const high = String(cfg?.mapColorHigh ?? "").trim() || MAP_VISUAL_DEFAULTS.mapColorHigh;
  if (mid && parseHexColor(mid)) return [low, mid, high];
  return [low, high];
}

/** Extrae del agg guardado solo campos de apariencia del mapa (para hidratar formularios). */
export function pickMapVisualFromCfg(cfg: unknown): MapVisualConfigInput {
  if (!cfg || typeof cfg !== "object") return {};
  const c = cfg as MapVisualConfigInput;
  const out: MapVisualConfigInput = {};
  if (c.mapDisplayModeDefault === "markers" || c.mapDisplayModeDefault === "choropleth") {
    out.mapDisplayModeDefault = c.mapDisplayModeDefault;
  }
  if (c.mapValueEncoding === "both" || c.mapValueEncoding === "color" || c.mapValueEncoding === "size") {
    out.mapValueEncoding = c.mapValueEncoding;
  }
  const low = typeof c.mapColorLow === "string" ? c.mapColorLow.trim() : "";
  if (low) out.mapColorLow = low;
  const mid = typeof c.mapColorMid === "string" ? c.mapColorMid.trim() : "";
  if (mid) out.mapColorMid = mid;
  const high = typeof c.mapColorHigh === "string" ? c.mapColorHigh.trim() : "";
  if (high) out.mapColorHigh = high;
  if (Array.isArray(c.mapColorStops)) {
    const stops = c.mapColorStops.map((s) => String(s).trim()).filter((s) => parseHexColor(s));
    if (stops.length >= 2) out.mapColorStops = stops.slice(0, 5);
  }
  if (c.mapChoroplethPalette) out.mapChoroplethPalette = normalizePalette(c.mapChoroplethPalette);
  if (c.mapChoroplethScaleMode) out.mapChoroplethScaleMode = normalizeScaleMode(c.mapChoroplethScaleMode);
  const nMin = Number(c.mapRadiusMin);
  if (Number.isFinite(nMin)) out.mapRadiusMin = nMin;
  const nMax = Number(c.mapRadiusMax);
  if (Number.isFinite(nMax)) out.mapRadiusMax = nMax;
  const opMin = Number(c.mapFillOpacityMin);
  if (Number.isFinite(opMin)) out.mapFillOpacityMin = opMin;
  const opMax = Number(c.mapFillOpacityMax);
  if (Number.isFinite(opMax)) out.mapFillOpacityMax = opMax;
  const sw = Number(c.mapStrokeWidth);
  if (Number.isFinite(sw)) out.mapStrokeWidth = sw;
  const empty = typeof c.mapChoroplethEmptyColor === "string" ? c.mapChoroplethEmptyColor.trim() : "";
  if (empty) out.mapChoroplethEmptyColor = empty;
  if (typeof c.mapChoroplethShowLabels === "boolean") out.mapChoroplethShowLabels = c.mapChoroplethShowLabels;
  if (typeof c.mapChoroplethShowLegend === "boolean") out.mapChoroplethShowLegend = c.mapChoroplethShowLegend;
  if (typeof c.mapChoroplethHideBaseMap === "boolean") out.mapChoroplethHideBaseMap = c.mapChoroplethHideBaseMap;
  if (c.mapChoroplethLabelSize) out.mapChoroplethLabelSize = normalizeLabelSize(c.mapChoroplethLabelSize);
  return out;
}

export function resolveMapVisualStyle(cfg?: MapVisualConfigInput | null): ResolvedMapVisualStyle {
  const encoding = normalizeEncoding(cfg?.mapValueEncoding);
  const colorLow = String(cfg?.mapColorLow ?? "").trim() || MAP_VISUAL_DEFAULTS.mapColorLow;
  const colorMidRaw = String(cfg?.mapColorMid ?? "").trim();
  const colorMid = colorMidRaw && parseHexColor(colorMidRaw) ? colorMidRaw : null;
  const colorHigh = String(cfg?.mapColorHigh ?? "").trim() || MAP_VISUAL_DEFAULTS.mapColorHigh;
  const colorStops = pickColorStopsFromCfg(cfg);
  const choroplethScaleMode = normalizeScaleMode(cfg?.mapChoroplethScaleMode);
  const choroplethPalette = normalizePalette(cfg?.mapChoroplethPalette);
  let radiusMin = finiteOr(MAP_VISUAL_DEFAULTS.mapRadiusMin, cfg?.mapRadiusMin);
  let radiusMax = finiteOr(MAP_VISUAL_DEFAULTS.mapRadiusMax, cfg?.mapRadiusMax);
  if (radiusMin < 1) radiusMin = 1;
  if (radiusMax < radiusMin) radiusMax = radiusMin;
  let opMin = finiteOr(MAP_VISUAL_DEFAULTS.mapFillOpacityMin, cfg?.mapFillOpacityMin);
  let opMax = finiteOr(MAP_VISUAL_DEFAULTS.mapFillOpacityMax, cfg?.mapFillOpacityMax);
  opMin = clamp01(opMin);
  opMax = clamp01(opMax);
  if (opMax < opMin) [opMin, opMax] = [opMax, opMin];
  const strokeWidth = Math.max(0, finiteOr(MAP_VISUAL_DEFAULTS.mapStrokeWidth, cfg?.mapStrokeWidth));
  const choroplethEmpty =
    String(cfg?.mapChoroplethEmptyColor ?? "").trim() || MAP_VISUAL_DEFAULTS.mapChoroplethEmptyColor;
  const choroplethShowLabels =
    typeof cfg?.mapChoroplethShowLabels === "boolean"
      ? cfg.mapChoroplethShowLabels
      : MAP_VISUAL_DEFAULTS.mapChoroplethShowLabels;
  const choroplethShowLegend =
    typeof cfg?.mapChoroplethShowLegend === "boolean"
      ? cfg.mapChoroplethShowLegend
      : MAP_VISUAL_DEFAULTS.mapChoroplethShowLegend;
  const choroplethHideBaseMap =
    typeof cfg?.mapChoroplethHideBaseMap === "boolean"
      ? cfg.mapChoroplethHideBaseMap
      : MAP_VISUAL_DEFAULTS.mapChoroplethHideBaseMap;
  const choroplethLabelSize = normalizeLabelSize(cfg?.mapChoroplethLabelSize);
  return {
    encoding,
    colorLow,
    colorMid,
    colorHigh,
    colorStops,
    choroplethScaleMode,
    choroplethPalette,
    radiusMin,
    radiusMax,
    fillOpacityMin: opMin,
    fillOpacityMax: opMax,
    choroplethFillOpacityMin: MAP_VISUAL_DEFAULTS.choroplethFillOpacityMin,
    choroplethFillOpacityMax: MAP_VISUAL_DEFAULTS.choroplethFillOpacityMax,
    strokeWidth,
    choroplethEmptyColor: choroplethEmpty,
    choroplethShowLabels,
    choroplethShowLegend,
    choroplethHideBaseMap,
    choroplethLabelSize,
  };
}

function scaledValue(value: number, minValue: number, maxValue: number, mode: MapChoroplethScaleMode): number {
  if (!(maxValue > minValue)) return value;
  if (mode === "log") {
    const logMin = Math.log1p(Math.max(0, minValue));
    const logMax = Math.log1p(Math.max(0, maxValue));
    if (!(logMax > logMin)) return 0;
    return Math.log1p(Math.max(0, value)) - logMin;
  }
  if (mode === "sqrt") {
    const sqMin = Math.sqrt(Math.max(0, minValue));
    const sqMax = Math.sqrt(Math.max(0, maxValue));
    if (!(sqMax > sqMin)) return 0;
    return Math.sqrt(Math.max(0, value)) - sqMin;
  }
  return value - minValue;
}

function scaledRange(minValue: number, maxValue: number, mode: MapChoroplethScaleMode): number {
  if (!(maxValue > minValue)) return 1;
  if (mode === "log") {
    const logMin = Math.log1p(Math.max(0, minValue));
    const logMax = Math.log1p(Math.max(0, maxValue));
    return Math.max(logMax - logMin, 1e-9);
  }
  if (mode === "sqrt") {
    const sqMin = Math.sqrt(Math.max(0, minValue));
    const sqMax = Math.sqrt(Math.max(0, maxValue));
    return Math.max(sqMax - sqMin, 1e-9);
  }
  return maxValue - minValue;
}

/** Intensidad 0–1 para un valor numérico en [min,max]. */
export function mapValueIntensity(
  value: number | null,
  minValue: number | null,
  maxValue: number | null,
  scaleMode: MapChoroplethScaleMode = "linear"
): number {
  if (value == null || minValue == null || maxValue == null) return 0.45;
  if (!(maxValue > minValue)) return 0.6;
  const range = scaledRange(minValue, maxValue, scaleMode);
  const t = scaledValue(value, minValue, maxValue, scaleMode) / range;
  return clamp01(t);
}

export type MarkerVisualResult = {
  radius: number;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
};

export function resolveMarkerVisual(
  value: number | null,
  minValue: number | null,
  maxValue: number | null,
  style: ResolvedMapVisualStyle
): MarkerVisualResult {
  const t = mapValueIntensity(value, minValue, maxValue, style.choroplethScaleMode);
  const { encoding, colorStops, colorLow, colorHigh, radiusMin, radiusMax, fillOpacityMin, fillOpacityMax, strokeWidth } =
    style;
  const midRadius = (radiusMin + radiusMax) / 2;
  const midOpacity = (fillOpacityMin + fillOpacityMax) / 2;
  const fillFromStops = colorStops.length >= 2 ? interpolateMapColorStops(colorStops, t) : interpolateMapColor(colorLow, colorHigh, t);

  let radius: number;
  let fillColor: string;
  let fillOpacity: number;

  if (encoding === "size") {
    radius = radiusMin + t * (radiusMax - radiusMin);
    fillColor = colorHigh;
    fillOpacity = midOpacity;
  } else if (encoding === "color") {
    radius = midRadius;
    fillColor = fillFromStops;
    fillOpacity = fillOpacityMin + t * (fillOpacityMax - fillOpacityMin);
  } else {
    radius = radiusMin + t * (radiusMax - radiusMin);
    fillColor = fillFromStops;
    fillOpacity = fillOpacityMin + t * (fillOpacityMax - fillOpacityMin);
  }

  return {
    radius,
    fillColor,
    fillOpacity,
    strokeColor: fillColor,
    strokeWidth,
  };
}

export type ChoroplethVisualResult = {
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWeight: number;
  intensity: number;
};

/** Estilo de relleno para provincias con dato. La intensidad va en color (opacidad alta fija). */
export function resolveChoroplethVisual(
  value: number | null,
  minValue: number | null,
  maxValue: number | null,
  style: ResolvedMapVisualStyle
): ChoroplethVisualResult {
  const t = mapValueIntensity(value, minValue, maxValue, style.choroplethScaleMode);
  const { colorStops, colorLow, colorHigh, choroplethFillOpacityMin, choroplethFillOpacityMax } = style;
  const fillColor =
    colorStops.length >= 2 ? interpolateMapColorStops(colorStops, t) : interpolateMapColor(colorLow, colorHigh, t);
  const fillOpacity = choroplethFillOpacityMin + t * (choroplethFillOpacityMax - choroplethFillOpacityMin);

  return {
    fillColor,
    fillOpacity,
    strokeColor: "#64748b",
    strokeWeight: Math.max(0.5, style.strokeWidth),
    intensity: t,
  };
}

/** Color de relleno para un valor dado (leyenda / ranking). */
export function resolveChoroplethFillColor(
  value: number | null,
  minValue: number | null,
  maxValue: number | null,
  style: ResolvedMapVisualStyle
): string {
  return resolveChoroplethVisual(value, minValue, maxValue, style).fillColor;
}
