/**
 * Escala visual del mapa (marcadores y coropleto): color, radio y opacidad según valor.
 */

export type MapValueEncoding = "both" | "color" | "size";

export type MapVisualConfigInput = {
  mapValueEncoding?: MapValueEncoding;
  mapColorLow?: string;
  mapColorHigh?: string;
  mapRadiusMin?: number;
  mapRadiusMax?: number;
  mapFillOpacityMin?: number;
  mapFillOpacityMax?: number;
  mapStrokeWidth?: number;
  mapChoroplethEmptyColor?: string;
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
} as const;

export type ResolvedMapVisualStyle = {
  encoding: MapValueEncoding;
  colorLow: string;
  colorHigh: string;
  radiusMin: number;
  radiusMax: number;
  fillOpacityMin: number;
  fillOpacityMax: number;
  strokeWidth: number;
  choroplethEmptyColor: string;
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

function normalizeEncoding(raw: unknown): MapValueEncoding {
  if (raw === "color" || raw === "size" || raw === "both") return raw;
  return MAP_VISUAL_DEFAULTS.mapValueEncoding;
}

function finiteOr(defaultVal: number, v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : defaultVal;
}

/** Extrae del agg guardado solo campos de apariencia del mapa (para hidratar formularios). */
export function pickMapVisualFromCfg(cfg: unknown): MapVisualConfigInput {
  if (!cfg || typeof cfg !== "object") return {};
  const c = cfg as MapVisualConfigInput;
  const out: MapVisualConfigInput = {};
  if (c.mapValueEncoding === "both" || c.mapValueEncoding === "color" || c.mapValueEncoding === "size") {
    out.mapValueEncoding = c.mapValueEncoding;
  }
  const low = typeof c.mapColorLow === "string" ? c.mapColorLow.trim() : "";
  if (low) out.mapColorLow = low;
  const high = typeof c.mapColorHigh === "string" ? c.mapColorHigh.trim() : "";
  if (high) out.mapColorHigh = high;
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
  return out;
}

export function resolveMapVisualStyle(cfg?: MapVisualConfigInput | null): ResolvedMapVisualStyle {
  const encoding = normalizeEncoding(cfg?.mapValueEncoding);
  const colorLow = String(cfg?.mapColorLow ?? "").trim() || MAP_VISUAL_DEFAULTS.mapColorLow;
  const colorHigh = String(cfg?.mapColorHigh ?? "").trim() || MAP_VISUAL_DEFAULTS.mapColorHigh;
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
  return {
    encoding,
    colorLow,
    colorHigh,
    radiusMin,
    radiusMax,
    fillOpacityMin: opMin,
    fillOpacityMax: opMax,
    strokeWidth,
    choroplethEmptyColor: choroplethEmpty,
  };
}

/** Intensidad 0–1 para un valor numérico en [min,max]; sin rango útil → ~centro. */
export function mapValueIntensity(
  value: number | null,
  minValue: number | null,
  maxValue: number | null
): number {
  if (value == null || minValue == null || maxValue == null) return 0.45;
  if (!(maxValue > minValue)) return 0.6;
  return clamp01((value - minValue) / (maxValue - minValue));
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
  const t = mapValueIntensity(value, minValue, maxValue);
  const { encoding, colorLow, colorHigh, radiusMin, radiusMax, fillOpacityMin, fillOpacityMax, strokeWidth } =
    style;
  const midRadius = (radiusMin + radiusMax) / 2;
  const midOpacity = (fillOpacityMin + fillOpacityMax) / 2;

  let radius: number;
  let fillColor: string;
  let fillOpacity: number;

  if (encoding === "size") {
    radius = radiusMin + t * (radiusMax - radiusMin);
    fillColor = colorHigh;
    fillOpacity = midOpacity;
  } else if (encoding === "color") {
    radius = midRadius;
    fillColor = interpolateMapColor(colorLow, colorHigh, t);
    fillOpacity = fillOpacityMin + t * (fillOpacityMax - fillOpacityMin);
  } else {
    radius = radiusMin + t * (radiusMax - radiusMin);
    fillColor = interpolateMapColor(colorLow, colorHigh, t);
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
};

/** Estilo de relleno para provincias con dato. En modo `size` el coropleto usa opacidad (sin radio). */
export function resolveChoroplethVisual(
  value: number | null,
  minValue: number | null,
  maxValue: number | null,
  style: ResolvedMapVisualStyle
): ChoroplethVisualResult {
  const t = mapValueIntensity(value, minValue, maxValue);
  const { encoding, colorLow, colorHigh, fillOpacityMin, fillOpacityMax } = style;
  const midOpacity = (fillOpacityMin + fillOpacityMax) / 2;

  if (encoding === "size") {
    return {
      fillColor: colorHigh,
      fillOpacity: fillOpacityMin + t * (fillOpacityMax - fillOpacityMin),
      strokeColor: "#64748b",
      strokeWeight: 1,
    };
  }
  return {
    fillColor: interpolateMapColor(colorLow, colorHigh, t),
    fillOpacity: fillOpacityMin + t * (fillOpacityMax - fillOpacityMin),
    strokeColor: "#64748b",
    strokeWeight: 1,
  };
}
