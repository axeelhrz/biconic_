"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  AR_BOUNDING_BOX,
  AR_GEOJSON_PATH,
  AR_GEOJSON_API_PATH,
  getArProvinceCentroid,
  isArgentinaDefaultCountry,
  isPointInArgentinaBBox,
  resolveArProvinceGadmId,
  type ArProvinceGadmId,
} from "@/lib/geo/argentinaProvinces";
import { findArProvinceGadmIdForLatLon } from "@/lib/geo/pointInProvinceGeoJson";
import type { MapDisplayMode, MapVisualConfigInput } from "@/lib/dashboard/mapVisualScale";
import {
  mapColorLuminance,
  mapColorStopsToCssGradient,
  resolveChoroplethFillColor,
  resolveChoroplethVisual,
  resolveMapVisualStyle,
  resolveMarkerVisual,
  type ResolvedMapVisualStyle,
} from "@/lib/dashboard/mapVisualScale";
import { getValueFormatter, type ChartStyleConfig } from "@/lib/dashboard/chartOptions";
import {
  buildDetailCardLineStringsFromRowMap,
  buildMapDetailPopupHtml,
  isChartDetailCardActive,
} from "@/lib/dashboard/chartDetailCard";
import type { BuildChartConfigWidget } from "@/lib/dashboard/buildChartConfig";

export type MapAggregationConfig = MapVisualConfigInput & {
  chartXAxis?: string;
  chartYAxes?: string[];
  dimension?: string;
  dimensions?: string[];
  mapDefaultCountry?: string;
  chartDetailCard?: unknown;
  metrics?: Array<{ alias?: string; func?: string; field?: string }>;
  enabled?: boolean;
};

type DashboardMapWidgetProps = {
  rows: Record<string, unknown>[];
  aggregationConfig?: MapAggregationConfig;
  mapDefaultCountry?: string;
  chartStyle?: ChartStyleConfig | null;
  darkChartTheme?: boolean;
  height?: number;
};

const DEFAULT_CENTER: [number, number] = [-34.6, -58.4];
const DEFAULT_ZOOM = 3;

/** Encuadre Argentina: mismo bbox que validación de geocodificación en lib/geo. */
const AR_MAX_BOUNDS: L.LatLngBoundsExpression = [
  [AR_BOUNDING_BOX.minLat, AR_BOUNDING_BOX.minLon],
  [AR_BOUNDING_BOX.maxLat, AR_BOUNDING_BOX.maxLon],
];
const AR_DEFAULT_CENTER: [number, number] = [-37.2, -64.6];
const AR_DEFAULT_ZOOM = 4;

const CARTO_LIGHT_TILE =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

type ArProvinceProps = { id?: string; name?: string };

type ArProvinceFeature = {
  type?: string;
  properties?: ArProvinceProps | null;
  geometry?: unknown;
};

type ArFeatureCollection = {
  type: "FeatureCollection";
  features: ArProvinceFeature[];
};

function isArFeatureCollection(value: unknown): value is ArFeatureCollection {
  if (!value || typeof value !== "object") return false;
  const v = value as ArFeatureCollection;
  return v.type === "FeatureCollection" && Array.isArray(v.features);
}

async function fetchArProvinceGeoJson(): Promise<ArFeatureCollection> {
  const sources = [AR_GEOJSON_PATH, AR_GEOJSON_API_PATH];
  let lastStatus: number | undefined;
  for (const url of sources) {
    try {
      const response = await fetch(url);
      lastStatus = response.status;
      if (!response.ok) continue;
      const json: unknown = await response.json();
      if (isArFeatureCollection(json)) return json;
    } catch {
      // try next source
    }
  }
  if (process.env.NODE_ENV === "development") {
    console.warn("[DashboardMapWidget] No se pudo cargar GeoJSON de provincias", { lastStatus, sources });
  }
  throw new Error("ar-geo-load-failed");
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  if (points.length === 0) return null;
  const valid = points.filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  if (valid.length === 0) return null;
  const lats = valid.map(([lat]) => lat);
  const lons = valid.map(([, lon]) => lon);
  const pad = 0.1;
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const dLat = (maxLat - minLat) || 0.5;
  const dLon = (maxLon - minLon) || 0.5;
  map.fitBounds(
    [
      [minLat - dLat * pad, minLon - dLon * pad],
      [maxLat + dLat * pad, maxLon + dLon * pad],
    ],
    { maxZoom: 14, padding: [20, 20] }
  );
  return null;
}

function FitArgentinaGeoJson({ data }: { data: ArFeatureCollection | null }) {
  const map = useMap();
  useEffect(() => {
    if (!data?.features?.length) return;
    const layer = L.geoJSON(data as never);
    const b = layer.getBounds();
    layer.remove();
    if (b.isValid()) {
      map.fitBounds(b, { padding: [18, 18], maxZoom: 5, animate: false });
    }
  }, [data, map]);
  return null;
}

function MapDisplayModeToggle({
  mode,
  onChange,
  choroplethDisabled,
  darkChartTheme = false,
}: {
  mode: MapDisplayMode;
  onChange: (m: MapDisplayMode) => void;
  choroplethDisabled: boolean;
  darkChartTheme?: boolean;
}) {
  const toggleTheme = darkChartTheme
    ? {
        bg: "var(--studio-bg-elevated, #141419)",
        border: "var(--studio-border, #3f3f46)",
        fg: "var(--studio-fg, #f4f4f5)",
        fgMuted: "var(--studio-fg-muted, #a1a1aa)",
      }
    : {
        bg: "rgba(255,255,255,0.95)",
        border: "var(--platform-border, #e2e8f0)",
        fg: "#0f172a",
        fgMuted: "#64748b",
      };

  return (
    <div
      className="absolute top-2 right-2 z-[1000] flex rounded-lg border p-0.5 text-[11px] font-medium shadow-sm"
      style={{
        borderColor: toggleTheme.border,
        background: toggleTheme.bg,
        color: toggleTheme.fg,
      }}
    >
      <button
        type="button"
        disabled={choroplethDisabled}
        title={
          choroplethDisabled
            ? "Configurá dimensión provincia y métricas reconocibles para Argentina"
            : undefined
        }
        onClick={() => !choroplethDisabled && onChange("choropleth")}
        className="rounded-md px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-45"
        style={{
          background: mode === "choropleth" ? "var(--platform-accent, #0f6fa8)" : "transparent",
          color: mode === "choropleth" ? "#fff" : toggleTheme.fg,
        }}
      >
        Provincias
      </button>
      <button
        type="button"
        onClick={() => onChange("markers")}
        className="rounded-md px-2.5 py-1 transition-colors"
        style={{
          background: mode === "markers" ? "var(--platform-accent, #0f6fa8)" : "transparent",
          color: mode === "markers" ? "#fff" : toggleTheme.fg,
        }}
      >
        Puntos
      </button>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatChoroplethLegendValue(
  value: number | null,
  formatValue: (v: number) => string
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatValue(value);
}

function createProvinceLabelIcon(name: string, fillColor: string, labelSize: "sm" | "md") {
  const lum = mapColorLuminance(fillColor);
  const textColor = lum > 0.55 ? "#0f172a" : "#f8fafc";
  const halo = lum > 0.55 ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.88)";
  const fontSize = labelSize === "sm" ? 10 : 11;
  const safeName = escapeHtml(name);
  return L.divIcon({
    className: "ar-province-map-label-icon",
    html: `<span style="display:inline-block;font-size:${fontSize}px;font-weight:600;line-height:1.2;color:${textColor};text-shadow:0 0 4px ${halo},0 0 8px ${halo};white-space:nowrap;pointer-events:none;transform:translate(-50%,-50%);">${safeName}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

type ProvinceLabelEntry = {
  id: ArProvinceGadmId;
  name: string;
  lat: number;
  lon: number;
  fillColor: string;
};

function ProvinceLabels({
  entries,
  show,
  labelSize,
}: {
  entries: ProvinceLabelEntry[];
  show: boolean;
  labelSize: "sm" | "md";
}) {
  if (!show) return null;
  return (
    <>
      {entries.map((entry) => (
        <Marker
          key={entry.id}
          position={[entry.lat, entry.lon]}
          icon={createProvinceLabelIcon(entry.name, entry.fillColor, labelSize)}
          interactive={false}
          zIndexOffset={1000}
        />
      ))}
    </>
  );
}

type RankedMapItem = {
  id: string;
  name: string;
  value: number;
  color: string;
};

function ChoroplethLegendPanel({
  mapVisual,
  minValue,
  maxValue,
  valueKey,
  ranked,
  formatValue,
  show,
  darkChartTheme = false,
}: {
  mapVisual: ResolvedMapVisualStyle;
  minValue: number | null;
  maxValue: number | null;
  valueKey: string;
  ranked: RankedMapItem[];
  formatValue: (v: number) => string;
  show: boolean;
  darkChartTheme?: boolean;
}) {
  if (!show) return null;
  const legendTheme = darkChartTheme
    ? {
        bg: "var(--studio-bg-elevated, #141419)",
        fg: "var(--studio-fg, #f4f4f5)",
        fgMuted: "var(--studio-fg-muted, #a1a1aa)",
        border: "var(--studio-border, #3f3f46)",
        cardBg: "var(--studio-surface, #1a1a22)",
        barTrack: "var(--studio-border, #3f3f46)",
      }
    : {
        bg: "var(--platform-surface, #f8fafc)",
        fg: "#0f172a",
        fgMuted: "#64748b",
        border: "var(--platform-border, #e2e8f0)",
        cardBg: "#ffffff",
        barTrack: "#e2e8f0",
      };
  const gradient = mapColorStopsToCssGradient(mapVisual.colorStops, "to right");
  const tickFractions = [0, 0.25, 0.5, 0.75, 1];
  const tickValues = tickFractions.map((f) => {
    if (minValue == null || maxValue == null) return null;
    if (f === 0) return minValue;
    if (f === 1) return maxValue;
    if (mapVisual.choroplethScaleMode === "log") {
      const logMin = Math.log1p(Math.max(0, minValue));
      const logMax = Math.log1p(Math.max(0, maxValue));
      return Math.expm1(logMin + f * (logMax - logMin));
    }
    if (mapVisual.choroplethScaleMode === "sqrt") {
      const sqMin = Math.sqrt(Math.max(0, minValue));
      const sqMax = Math.sqrt(Math.max(0, maxValue));
      const v = sqMin + f * (sqMax - sqMin);
      return v * v;
    }
    return minValue + f * (maxValue - minValue);
  });

  return (
    <div
      className="flex-shrink-0 border-t px-3 py-2.5"
      style={{
        borderColor: legendTheme.border,
        background: legendTheme.bg,
        color: legendTheme.fg,
      }}
    >
      <div className="mb-2 flex items-center gap-3">
        {valueKey ? (
          <span
            className="shrink-0 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: legendTheme.fgMuted }}
          >
            {valueKey}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div
            className="h-2.5 w-full rounded-full border"
            style={{
              borderColor: legendTheme.border,
              background: gradient,
            }}
          />
          <div
            className="mt-1 flex justify-between gap-1 text-[9px]"
            style={{ color: legendTheme.fgMuted }}
          >
            {tickValues.map((v, i) => (
              <span key={i} className="truncate">
                {formatChoroplethLegendValue(v, formatValue)}
              </span>
            ))}
          </div>
        </div>
      </div>
      {ranked.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
          {ranked.map((item) => {
            const barPct = maxValue && maxValue > 0 ? Math.max(8, (item.value / maxValue) * 100) : 8;
            return (
              <div
                key={item.id}
                className="rounded-md border px-2 py-1.5"
                style={{ borderColor: legendTheme.border, background: legendTheme.cardBg }}
              >
                <div
                  className="truncate text-[10px] font-medium"
                  style={{ color: legendTheme.fg }}
                  title={item.name}
                >
                  {item.name}
                </div>
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-full"
                  style={{ background: legendTheme.barTrack }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${barPct}%`, background: item.color }}
                  />
                </div>
                <div
                  className="mt-0.5 truncate text-[9px] font-semibold"
                  style={{ color: legendTheme.fg }}
                >
                  {formatValue(item.value)}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MapMarkerDetailBody({
  marker,
  sumRows,
  aggregationConfig,
  valueKey,
}: {
  marker: { label: string; source: string; value: number | null; detailRow: Record<string, unknown> };
  sumRows: Record<string, unknown>[];
  aggregationConfig?: MapAggregationConfig;
  valueKey: string;
}) {
  const widget: BuildChartConfigWidget = {
    type: "map",
    aggregationConfig: aggregationConfig as BuildChartConfigWidget["aggregationConfig"],
  };
  const place = marker.label || `(${marker.detailRow.__geo_label ?? "—"})`;
  const parsed = buildDetailCardLineStringsFromRowMap({
    detailRaw: aggregationConfig?.chartDetailCard,
    row: { ...marker.detailRow, __category: place },
    sumRows,
    widget,
  });
  if (parsed?.lines.length) {
    return (
      <div className="space-y-1 text-xs">
        <strong>{parsed.title ?? place}</strong>
        {parsed.description ? <p className="text-[11px] opacity-90">{parsed.description}</p> : null}
        {parsed.lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    );
  }
  const value = marker.value != null ? String(marker.value) : "";
  const popupContent = [place, value].filter(Boolean).join(" — ");
  return (
    <div className="space-y-1 text-xs">
      <div>{popupContent}</div>
      {valueKey ? <div>Valor: {value}</div> : null}
      <div>Fuente: {marker.source || "native"}</div>
    </div>
  );
}

export function DashboardMapWidget({
  rows,
  aggregationConfig,
  mapDefaultCountry: mapDefaultCountryProp,
  chartStyle,
  darkChartTheme = false,
  height = 280,
}: DashboardMapWidgetProps) {
  const mapDefaultCountry = mapDefaultCountryProp ?? aggregationConfig?.mapDefaultCountry;
  const argentinaMode = isArgentinaDefaultCountry(mapDefaultCountry);

  const [arGeo, setArGeo] = useState<ArFeatureCollection | null>(null);
  const [arGeoError, setArGeoError] = useState(false);

  useEffect(() => {
    if (!argentinaMode) return;
    let cancelled = false;
    setArGeoError(false);
    fetchArProvinceGeoJson()
      .then((fc) => {
        if (!cancelled) setArGeo(fc);
      })
      .catch(() => {
        if (!cancelled) setArGeoError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [argentinaMode]);

  const { markers, valueKey, unresolvedCount, provinceSums, provinceMetricBags, provinceMatchRows } = useMemo(() => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        markers: [] as Array<{
          lat: number;
          lon: number;
          value: number | null;
          label: string;
          source: string;
          detailRow: Record<string, unknown>;
        }>,
        valueKey: "",
        unresolvedCount: 0,
        provinceSums: new Map<ArProvinceGadmId, number>(),
        provinceMetricBags: new Map<ArProvinceGadmId, Record<string, number>>(),
        provinceMatchRows: 0,
      };
    }
    const first = rows[0] as Record<string, unknown>;
    const keys = Object.keys(first);

    const geoLatKey = keys.find((k) => /^__geo_lat$/i.test(k));
    const geoLonKey = keys.find((k) => /^__geo_lon$/i.test(k));
    const geoLabelKey = keys.find((k) => /^__geo_label$/i.test(k));
    const geoSourceKey = keys.find((k) => /^__geo_source$/i.test(k));
    const latKey = keys.find(
      (k) => /^lat$|^latitude$/i.test(k) || (typeof first[k] === "number" && /lat/i.test(k))
    );
    const lonKey = keys.find(
      (k) => /^lon$|^lng$|^longitude$/i.test(k) || (k !== latKey && typeof first[k] === "number" && /lon|lng|long/i.test(k))
    );

    let latColRes = geoLatKey ?? latKey ?? null;
    let lonColRes = geoLonKey ?? lonKey ?? null;
    if (!latColRes || !lonColRes) {
      const withLat = keys.find((k) => /lat|latitude/i.test(k));
      const withLon = keys.find((k) => /lon|lng|longitude/i.test(k));
      if (withLat && withLon) {
        latColRes = withLat;
        lonColRes = withLon;
      }
    }

    const xAxis = aggregationConfig?.chartXAxis ?? aggregationConfig?.dimension ?? aggregationConfig?.dimensions?.[0];
    const yAxes = aggregationConfig?.chartYAxes;
    const labelKeyRes =
      geoLabelKey ?? (xAxis && keys.includes(xAxis) ? xAxis : (keys.find((k) => typeof first[k] === "string") ?? ""));
    const valueKeyRes =
      Array.isArray(yAxes) && yAxes[0] && keys.includes(yAxes[0])
        ? yAxes[0]
        : (keys.find((k) => typeof first[k] === "number" && k !== latColRes && k !== lonColRes) ?? "");

    const valueKeysForAgg =
      Array.isArray(yAxes) && yAxes.length > 0
        ? yAxes.map(String).filter((k) => k && keys.includes(k))
        : valueKeyRes
          ? [valueKeyRes]
          : [];

    const provinceSumsRes = new Map<ArProvinceGadmId, number>();
    const provinceMetricBagsRes = new Map<ArProvinceGadmId, Record<string, number>>();
    let provinceMatchRowsRes = 0;

    const useProvincePolygons =
      argentinaMode && arGeo && !arGeoError && Array.isArray(arGeo.features) && arGeo.features.length > 0;

    const rowHasMapMetric = (r: Record<string, unknown>) =>
      valueKeysForAgg.some((k) => Number.isFinite(Number(r[k]))) ||
      (!!valueKeyRes && Number.isFinite(Number(r[valueKeyRes])));

    const addProvinceMetrics = (pid: ArProvinceGadmId, r: Record<string, unknown>) => {
      provinceMatchRowsRes += 1;
      let bag = provinceMetricBagsRes.get(pid);
      if (!bag) {
        bag = {};
        provinceMetricBagsRes.set(pid, bag);
      }
      for (const k of valueKeysForAgg) {
        const n = Number(r[k]);
        if (Number.isFinite(n)) bag[k] = (bag[k] ?? 0) + n;
        const prevKey = `${k}_prev`;
        const prevN = Number(r[prevKey]);
        if (Number.isFinite(prevN)) bag[prevKey] = (bag[prevKey] ?? 0) + prevN;
        const deltaKey = `${k}_delta_pct`;
        const deltaN = Number(r[deltaKey]);
        if (Number.isFinite(deltaN) && bag[deltaKey] == null) bag[deltaKey] = deltaN;
      }
      if (valueKeyRes) {
        const n = Number(r[valueKeyRes]);
        if (Number.isFinite(n)) {
          provinceSumsRes.set(pid, (provinceSumsRes.get(pid) ?? 0) + n);
        }
      }
    };

    for (const row of rows.slice(0, 500)) {
      const r = row as Record<string, unknown>;
      const rawLabel = labelKeyRes ? r[labelKeyRes] : "";
      const fromDim = rawLabel != null ? String(rawLabel) : "";
      const fromGeo = r.__geo_label != null ? String(r.__geo_label) : "";

      let pid: ArProvinceGadmId | null = null;
      let attributed = false;
      if (latColRes && lonColRes) {
        const lat = Number(r[latColRes]);
        const lon = Number(r[lonColRes]);
        if (useProvincePolygons && Number.isFinite(lat) && Number.isFinite(lon) && isPointInArgentinaBBox(lat, lon)) {
          const pidPt = findArProvinceGadmIdForLatLon(arGeo, lat, lon);
          if (pidPt) {
            pid = pidPt;
            attributed = true;
          }
        }
      }
      if (!attributed) {
        pid = resolveArProvinceGadmId(fromDim) ?? resolveArProvinceGadmId(fromGeo);
      }
      if (!pid) continue;
      if (!rowHasMapMetric(r)) continue;
      addProvinceMetrics(pid, r);
    }

    if (!latColRes || !lonColRes) {
      const unresolved = rows.length;
      return {
        markers: [] as Array<{
          lat: number;
          lon: number;
          value: number | null;
          label: string;
          source: string;
          detailRow: Record<string, unknown>;
        }>,
        valueKey: valueKeyRes ?? "",
        unresolvedCount: unresolved,
        provinceSums: provinceSumsRes,
        provinceMetricBags: provinceMetricBagsRes,
        provinceMatchRows: provinceMatchRowsRes,
      };
    }

    const markersRes: Array<{
      lat: number;
      lon: number;
      value: number | null;
      label: string;
      source: string;
      detailRow: Record<string, unknown>;
    }> = [];
    for (const row of rows.slice(0, 500)) {
      const r = row as Record<string, unknown>;
      const lat = Number(r[latColRes!]);
      const lon = Number(r[lonColRes!]);
      const rawLabel = labelKeyRes ? r[labelKeyRes] : "";
      const label = rawLabel != null ? String(rawLabel) : "";
      const valueCandidate = valueKeyRes ? Number(r[valueKeyRes]) : NaN;
      const sourceValue = geoSourceKey ? String(r[geoSourceKey] ?? "") : "native";
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      markersRes.push({
        lat,
        lon,
        value: Number.isFinite(valueCandidate) ? valueCandidate : null,
        label,
        source: sourceValue,
        detailRow: { ...r },
      });
    }

    const unresolvedCountRes = rows.reduce((acc, row) => {
      const r = row as Record<string, unknown>;
      const lat = Number(r[latColRes!]);
      const lon = Number(r[lonColRes!]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return acc;
      const unresolvedFlag = r.__geo_resolved;
      if (unresolvedFlag === false) return acc + 1;
      return acc + 1;
    }, 0);

    return {
      markers: markersRes,
      valueKey: valueKeyRes ?? "",
      unresolvedCount: unresolvedCountRes,
      provinceSums: provinceSumsRes,
      provinceMetricBags: provinceMetricBagsRes,
      provinceMatchRows: provinceMatchRowsRes,
    };
  }, [rows, aggregationConfig, arGeo, arGeoError, argentinaMode]);

  const mapVisual = useMemo(() => resolveMapVisualStyle(aggregationConfig), [aggregationConfig]);

  const formatMetricValue = useMemo(() => {
    const fmt = getValueFormatter(chartStyle ?? undefined, "value");
    return (v: number) => {
      if (!Number.isFinite(v)) return "—";
      return fmt(v);
    };
  }, [chartStyle]);

  const provinceNameById = useMemo(() => {
    const m = new Map<ArProvinceGadmId, string>();
    for (const f of arGeo?.features ?? []) {
      const id = f.properties?.id as ArProvinceGadmId | undefined;
      const name = f.properties?.name;
      if (id && name) m.set(id, name);
    }
    return m;
  }, [arGeo]);

  const canChoropleth = argentinaMode && arGeo && !arGeoError && provinceSums.size > 0;
  const canShowArgentinaToggle = argentinaMode && arGeo && !arGeoError;

  const cfgDisplayDefault = aggregationConfig?.mapDisplayModeDefault;
  const [displayMode, setDisplayMode] = useState<MapDisplayMode>(() => {
    if (cfgDisplayDefault === "markers" || cfgDisplayDefault === "choropleth") return cfgDisplayDefault;
    return argentinaMode ? "choropleth" : "markers";
  });
  const [displayModeTouched, setDisplayModeTouched] = useState(false);

  useEffect(() => {
    if (displayModeTouched) return;
    if (cfgDisplayDefault === "markers") {
      setDisplayMode("markers");
      return;
    }
    if (cfgDisplayDefault === "choropleth" || (argentinaMode && canChoropleth)) {
      setDisplayMode("choropleth");
      return;
    }
    setDisplayMode("markers");
  }, [cfgDisplayDefault, canChoropleth, displayModeTouched, argentinaMode]);

  const showChoropleth = displayMode === "choropleth" && canChoropleth;

  const choroplethNumeric = useMemo(() => [...provinceSums.values()].filter((v) => Number.isFinite(v)), [provinceSums]);
  const chMin = choroplethNumeric.length > 0 ? Math.min(...choroplethNumeric) : null;
  const chMax = choroplethNumeric.length > 0 ? Math.max(...choroplethNumeric) : null;

  const rankedProvinces = useMemo((): RankedMapItem[] => {
    return [...provinceSums.entries()]
      .filter(([, v]) => Number.isFinite(v))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, value]) => ({
        id,
        name: provinceNameById.get(id) ?? id,
        value,
        color: resolveChoroplethFillColor(value, chMin, chMax, mapVisual),
      }));
  }, [provinceSums, provinceNameById, chMin, chMax, mapVisual]);

  const provinceLabelEntries = useMemo((): ProvinceLabelEntry[] => {
    const out: ProvinceLabelEntry[] = [];
    for (const [id, value] of provinceSums.entries()) {
      if (!Number.isFinite(value)) continue;
      const name = provinceNameById.get(id);
      const centroid = getArProvinceCentroid(id);
      if (!name || !centroid) continue;
      out.push({
        id,
        name,
        lat: centroid.lat,
        lon: centroid.lon,
        fillColor: resolveChoroplethFillColor(value, chMin, chMax, mapVisual),
      });
    }
    return out;
  }, [provinceSums, provinceNameById, chMin, chMax, mapVisual]);

  const points = markers.map((m) => [m.lat, m.lon] as [number, number]);

  const markerNumericValues = useMemo(
    () => markers.map((m) => m.value).filter((v): v is number => Number.isFinite(v)),
    [markers]
  );
  const markerMin = markerNumericValues.length > 0 ? Math.min(...markerNumericValues) : null;
  const markerMax = markerNumericValues.length > 0 ? Math.max(...markerNumericValues) : null;

  const rankedMarkers = useMemo((): RankedMapItem[] => {
    return markers
      .filter((m): m is typeof m & { value: number } => Number.isFinite(m.value))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
      .map((m, i) => ({
        id: m.label ? `${m.label}-${i}` : `${m.lat},${m.lon}`,
        name: m.label || `${m.lat.toFixed(2)}, ${m.lon.toFixed(2)}`,
        value: m.value,
        color: resolveChoroplethFillColor(m.value, markerMin, markerMax, mapVisual),
      }));
  }, [markers, markerMin, markerMax, mapVisual]);

  const mapWidgetForDetail = useMemo(
    (): BuildChartConfigWidget => ({
      type: "map",
      aggregationConfig: aggregationConfig as BuildChartConfigWidget["aggregationConfig"],
    }),
    [aggregationConfig]
  );

  const provinceSumRows = useMemo(
    () => [...provinceMetricBags.values()].map((b) => ({ ...b })),
    [provinceMetricBags]
  );

  if (argentinaMode && !arGeoError && !arGeo) {
    return (
      <div
        className="flex flex-1 items-center justify-center rounded border text-center text-sm"
        style={{
          height: `${height}px`,
          borderColor: "var(--platform-border, #e2e8f0)",
          color: "var(--platform-fg-muted, #64748b)",
        }}
      >
        Cargando mapa de provincias…
      </div>
    );
  }

  const handleDisplayModeChange = (m: MapDisplayMode) => {
    setDisplayModeTouched(true);
    setDisplayMode(m);
  };

  if (showChoropleth) {
    const strokeBase = Math.max(0.5, mapVisual.strokeWidth);
    const styleFeature = (feature: ArProvinceFeature | null | undefined) => {
      const id = feature?.properties?.id as ArProvinceGadmId | undefined;
      const v = id ? provinceSums.get(id) : undefined;
      const has = v != null && Number.isFinite(v);
      if (!has) {
        return {
          fillColor: mapVisual.choroplethEmptyColor,
          fillOpacity: 0.92,
          color: "#94a3b8",
          weight: strokeBase,
          opacity: 1,
        };
      }
      const ch = resolveChoroplethVisual(v, chMin, chMax, mapVisual);
      return {
        fillColor: ch.fillColor,
        fillOpacity: ch.fillOpacity,
        color: ch.strokeColor,
        weight: ch.strokeWeight,
        opacity: 0.95,
      };
    };

    const legendHeight = mapVisual.choroplethShowLegend ? 118 : 0;
    const mapAreaHeight = Math.max(160, height - legendHeight);

    return (
      <div
        className="relative flex flex-col overflow-hidden rounded border"
        style={{
          height: `${height}px`,
          borderColor: "var(--platform-border, #e2e8f0)",
          background: mapVisual.choroplethHideBaseMap ? "#f1f5f9" : undefined,
        }}
      >
        <div className="relative min-h-0 flex-1">
        {canShowArgentinaToggle ? (
          <MapDisplayModeToggle
            mode={displayMode}
            onChange={handleDisplayModeChange}
            choroplethDisabled={!canChoropleth}
            darkChartTheme={darkChartTheme}
          />
        ) : null}
        <style
          dangerouslySetInnerHTML={{
            __html: `.ar-province-map-label-icon{background:transparent!important;border:none!important}`,
          }}
        />
        <MapContainer
          center={AR_DEFAULT_CENTER}
          zoom={AR_DEFAULT_ZOOM}
          style={{ height: `${mapAreaHeight}px`, width: "100%", background: mapVisual.choroplethHideBaseMap ? "#f1f5f9" : undefined }}
          scrollWheelZoom={true}
          maxBounds={AR_MAX_BOUNDS}
          maxBoundsViscosity={0.82}
        >
          {!mapVisual.choroplethHideBaseMap ? (
            <TileLayer attribution={CARTO_ATTRIBUTION} url={CARTO_LIGHT_TILE} />
          ) : null}
          <FitArgentinaGeoJson data={arGeo} />
          <GeoJSON
            data={arGeo as never}
            style={(feat) => styleFeature(feat as ArProvinceFeature)}
            onEachFeature={(feature, layer) => {
              const props = feature.properties as { id?: string; name?: string } | undefined;
              const id = props?.id as ArProvinceGadmId | undefined;
              const name = props?.name ?? id ?? "Provincia";
              const v = id ? provinceSums.get(id) : undefined;
              const valueStr =
                v != null && Number.isFinite(v) ? formatMetricValue(v) : "Sin dato";
              const bag = id ? provinceMetricBags.get(id) : undefined;
              const detailRow = bag && Object.keys(bag).length > 0 ? { ...bag } : null;
              const custom =
                isChartDetailCardActive(aggregationConfig?.chartDetailCard) && detailRow
                  ? buildMapDetailPopupHtml({
                      placeTitle: name,
                      row: detailRow,
                      sumRows: provinceSumRows,
                      widget: mapWidgetForDetail,
                      detailRaw: aggregationConfig?.chartDetailCard,
                    })
                  : null;
              if (custom) {
                layer.bindPopup(custom);
              } else {
                const safeName = escapeHtml(name);
                const safeKey = escapeHtml(valueKey);
                const safeVal = escapeHtml(valueStr);
                const prevVal = valueKey && bag ? bag[`${valueKey}_prev`] : undefined;
                const deltaPct = valueKey && bag ? bag[`${valueKey}_delta_pct`] : undefined;
                const compareLine =
                  prevVal != null && Number.isFinite(Number(prevVal))
                    ? `<div class="text-[10px] opacity-80">vs ${escapeHtml(formatMetricValue(Number(prevVal)))}${
                        deltaPct != null && Number.isFinite(Number(deltaPct))
                          ? ` (${Number(deltaPct) >= 0 ? "+" : ""}${Number(deltaPct).toFixed(1)}%)`
                          : ""
                      }</div>`
                    : "";
                layer.bindPopup(
                  `<div class="text-xs space-y-1"><strong>${safeName}</strong>${valueKey ? `<div>${safeKey}: ${safeVal}</div>` : `<div>${safeVal}</div>`}${compareLine}</div>`
                );
              }
              const pathLayer = layer as L.Path;
              const baseStyle = styleFeature(feature as ArProvinceFeature);
              layer.on("mouseover", () => {
                pathLayer.setStyle({ weight: strokeBase + 1.2 });
              });
              layer.on("mouseout", () => {
                pathLayer.setStyle(baseStyle);
              });
            }}
          />
          <ProvinceLabels
            entries={provinceLabelEntries}
            show={mapVisual.choroplethShowLabels}
            labelSize={mapVisual.choroplethLabelSize}
          />
        </MapContainer>
        {provinceMatchRows < rows.length ? (
          <div
            className="pointer-events-none absolute bottom-2 left-2 rounded px-2 py-1 text-[11px]"
            style={{
              background: "rgba(15,23,42,0.75)",
              color: "#f8fafc",
            }}
          >
            {rows.length - provinceMatchRows} filas sin provincia reconocida
          </div>
        ) : null}
        </div>
        <ChoroplethLegendPanel
          mapVisual={mapVisual}
          minValue={chMin}
          maxValue={chMax}
          valueKey={valueKey}
          ranked={rankedProvinces}
          formatValue={formatMetricValue}
          show={mapVisual.choroplethShowLegend}
          darkChartTheme={darkChartTheme}
        />
      </div>
    );
  }

  if (displayMode === "choropleth" && argentinaMode && arGeo && !arGeoError && provinceSums.size === 0) {
    return (
      <div
        className="relative flex flex-1 flex-col items-center justify-center rounded border text-center text-sm"
        style={{
          height: `${height}px`,
          borderColor: "var(--platform-border, #e2e8f0)",
          color: "var(--platform-fg-muted, #64748b)",
        }}
      >
        {canShowArgentinaToggle ? (
          <MapDisplayModeToggle
            mode={displayMode}
            onChange={handleDisplayModeChange}
            choroplethDisabled={true}
            darkChartTheme={darkChartTheme}
          />
        ) : null}
        <p className="mb-1">Sin provincias reconocidas en los datos</p>
        <p className="text-xs px-4 max-w-md">
          Revisá que la dimensión del eje X sea el nombre de provincia (ej. Córdoba, Buenos Aires, CABA).
          Si usás ciudad o localidad, activá «Forzar Argentina en todas las filas» y actualizá los datos, o cambiá a «Puntos» si tenés latitud/longitud.
        </p>
      </div>
    );
  }

  if (markers.length === 0) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center rounded border text-center text-sm"
        style={{
          height: `${height}px`,
          borderColor: "var(--platform-border, #e2e8f0)",
          color: "var(--platform-fg-muted, #64748b)",
        }}
      >
        <p className="mb-1">Sin coordenadas para mostrar en el mapa</p>
        <p className="text-xs">
          Verificá una dimensión geo (país/provincia/localidad) o columnas de latitud/longitud.
          {argentinaMode && provinceSums.size === 0 && arGeo && !arGeoError ? (
            <span className="block mt-1">Para el mapa por provincias, configurá «País por defecto del mapa» en Argentina y que los nombres de provincia coincidan con las jurisdicciones.</span>
          ) : null}
        </p>
      </div>
    );
  }

  const minValue = markerMin;
  const maxValue = markerMax;

  const tileUrl =
    argentinaMode && arGeo && !arGeoError ? CARTO_LIGHT_TILE : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const attribution =
    argentinaMode && arGeo && !arGeoError
      ? CARTO_ATTRIBUTION
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  const legendHeight = mapVisual.choroplethShowLegend ? 118 : 0;
  const mapAreaHeight = Math.max(160, height - legendHeight);

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded border"
      style={{ height: `${height}px`, borderColor: "var(--platform-border, #e2e8f0)" }}
    >
      <div className="relative min-h-0 flex-1">
      {canShowArgentinaToggle ? (
        <MapDisplayModeToggle
          mode={displayMode}
          onChange={handleDisplayModeChange}
          choroplethDisabled={!canChoropleth}
          darkChartTheme={darkChartTheme}
        />
      ) : null}
      {arGeoError && argentinaMode ? (
        <div
          className="pointer-events-none absolute bottom-2 right-2 z-[1000] rounded px-2 py-1 text-[11px]"
          style={{ background: "rgba(15,23,42,0.75)", color: "#f8fafc" }}
        >
          No se pudo cargar el mapa de provincias
        </div>
      ) : null}
      <MapContainer
        center={argentinaMode ? AR_DEFAULT_CENTER : DEFAULT_CENTER}
        zoom={argentinaMode ? AR_DEFAULT_ZOOM : DEFAULT_ZOOM}
        style={{ height: `${mapAreaHeight}px`, width: "100%" }}
        scrollWheelZoom={true}
        {...(argentinaMode && arGeo && !arGeoError
          ? { maxBounds: AR_MAX_BOUNDS, maxBoundsViscosity: 0.82 }
          : {})}
      >
        <TileLayer attribution={attribution} url={tileUrl} />
        <FitBounds points={points} />
        {markers.map((marker, i) => {
          const mv = resolveMarkerVisual(marker.value, minValue, maxValue, mapVisual);
          return (
            <CircleMarker
              key={i}
              center={[marker.lat, marker.lon]}
              radius={mv.radius}
              pathOptions={{
                fillColor: mv.fillColor,
                color: mv.strokeColor,
                weight: mv.strokeWidth,
                opacity: 0.9,
                fillOpacity: mv.fillOpacity,
              }}
            >
              <Popup>
                <MapMarkerDetailBody
                  marker={marker}
                  sumRows={rows.slice(0, 500) as Record<string, unknown>[]}
                  aggregationConfig={aggregationConfig}
                  valueKey={valueKey}
                />
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {unresolvedCount > 0 ? (
        <div
          className="pointer-events-none absolute bottom-2 left-2 rounded px-2 py-1 text-[11px]"
          style={{
            background: "rgba(15,23,42,0.75)",
            color: "#f8fafc",
          }}
        >
          {unresolvedCount} ubicaciones sin resolver
        </div>
      ) : null}
      </div>
      <ChoroplethLegendPanel
        mapVisual={mapVisual}
        minValue={minValue}
        maxValue={maxValue}
        valueKey={valueKey}
        ranked={rankedMarkers}
        formatValue={formatMetricValue}
        show={mapVisual.choroplethShowLegend}
        darkChartTheme={darkChartTheme}
      />
    </div>
  );
}
