"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  AR_BOUNDING_BOX,
  AR_GEOJSON_PATH,
  isArgentinaDefaultCountry,
  resolveArProvinceGadmId,
  type ArProvinceGadmId,
} from "@/lib/geo/argentinaProvinces";
import type { MapVisualConfigInput } from "@/lib/dashboard/mapVisualScale";
import {
  resolveChoroplethVisual,
  resolveMapVisualStyle,
  resolveMarkerVisual,
} from "@/lib/dashboard/mapVisualScale";

export type MapAggregationConfig = MapVisualConfigInput & {
  chartXAxis?: string;
  chartYAxes?: string[];
  dimension?: string;
  dimensions?: string[];
  mapDefaultCountry?: string;
};

type DashboardMapWidgetProps = {
  rows: Record<string, unknown>[];
  aggregationConfig?: MapAggregationConfig;
  mapDefaultCountry?: string;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function DashboardMapWidget({
  rows,
  aggregationConfig,
  mapDefaultCountry: mapDefaultCountryProp,
  height = 280,
}: DashboardMapWidgetProps) {
  const mapDefaultCountry = mapDefaultCountryProp ?? aggregationConfig?.mapDefaultCountry;
  const argentinaMode = isArgentinaDefaultCountry(mapDefaultCountry);

  const [arGeo, setArGeo] = useState<ArFeatureCollection | null>(null);
  const [arGeoError, setArGeoError] = useState(false);

  useEffect(() => {
    if (!argentinaMode) return;
    let cancelled = false;
    fetch(AR_GEOJSON_PATH)
      .then((r) => {
        if (!r.ok) throw new Error("geo");
        return r.json();
      })
      .then((j: unknown) => {
        const fc = j as ArFeatureCollection;
        if (!cancelled && fc?.type === "FeatureCollection" && Array.isArray(fc.features)) setArGeo(fc);
      })
      .catch(() => {
        if (!cancelled) setArGeoError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [argentinaMode]);

  const { markers, valueKey, unresolvedCount, provinceSums, provinceMatchRows } = useMemo(() => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        markers: [] as Array<{ lat: number; lon: number; value: number | null; label: string; source: string }>,
        valueKey: "",
        unresolvedCount: 0,
        provinceSums: new Map<ArProvinceGadmId, number>(),
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

    const provinceSumsRes = new Map<ArProvinceGadmId, number>();
    let provinceMatchRowsRes = 0;

    for (const row of rows.slice(0, 500)) {
      const r = row as Record<string, unknown>;
      const rawLabel = labelKeyRes ? r[labelKeyRes] : "";
      const fromDim = rawLabel != null ? String(rawLabel) : "";
      const fromGeo = r.__geo_label != null ? String(r.__geo_label) : "";
      const pid = resolveArProvinceGadmId(fromDim) ?? resolveArProvinceGadmId(fromGeo);
      if (!pid) continue;
      const valueCandidate = valueKeyRes ? Number(r[valueKeyRes]) : NaN;
      if (!Number.isFinite(valueCandidate)) continue;
      provinceMatchRowsRes += 1;
      provinceSumsRes.set(pid, (provinceSumsRes.get(pid) ?? 0) + valueCandidate);
    }

    if (!latColRes || !lonColRes) {
      const unresolved = rows.length;
      return {
        markers: [],
        valueKey: valueKeyRes ?? "",
        unresolvedCount: unresolved,
        provinceSums: provinceSumsRes,
        provinceMatchRows: provinceMatchRowsRes,
      };
    }

    const markersRes = rows
      .slice(0, 500)
      .map((row) => {
        const r = row as Record<string, unknown>;
        const lat = Number(r[latColRes!]);
        const lon = Number(r[lonColRes!]);
        const rawLabel = labelKeyRes ? r[labelKeyRes] : "";
        const label = rawLabel != null ? String(rawLabel) : "";
        const valueCandidate = valueKeyRes ? Number(r[valueKeyRes]) : NaN;
        const sourceValue = geoSourceKey ? String(r[geoSourceKey] ?? "") : "native";
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return {
          lat,
          lon,
          value: Number.isFinite(valueCandidate) ? valueCandidate : null,
          label,
          source: sourceValue,
        };
      })
      .filter(Boolean) as Array<{ lat: number; lon: number; value: number | null; label: string; source: string }>;

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
      provinceMatchRows: provinceMatchRowsRes,
    };
  }, [rows, aggregationConfig]);

  const mapVisual = useMemo(() => resolveMapVisualStyle(aggregationConfig), [aggregationConfig]);

  const useArChoropleth =
    argentinaMode && arGeo && !arGeoError && provinceSums.size > 0;

  const choroplethNumeric = useMemo(() => [...provinceSums.values()].filter((v) => Number.isFinite(v)), [provinceSums]);
  const chMin = choroplethNumeric.length > 0 ? Math.min(...choroplethNumeric) : null;
  const chMax = choroplethNumeric.length > 0 ? Math.max(...choroplethNumeric) : null;

  const points = markers.map((m) => [m.lat, m.lon] as [number, number]);

  if (argentinaMode && provinceSums.size > 0 && !arGeoError && !arGeo) {
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

  if (useArChoropleth) {
    const styleFeature = (feature: ArProvinceFeature | null | undefined) => {
      const id = feature?.properties?.id as ArProvinceGadmId | undefined;
      const v = id ? provinceSums.get(id) : undefined;
      const has = v != null && Number.isFinite(v);
      if (!has) {
        return {
          fillColor: mapVisual.choroplethEmptyColor,
          fillOpacity: 0.92,
          color: "#b8c5d6",
          weight: 0.9,
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

    return (
      <div
        className="relative rounded overflow-hidden border"
        style={{ height: `${height}px`, borderColor: "var(--platform-border, #e2e8f0)" }}
      >
        <MapContainer
          center={AR_DEFAULT_CENTER}
          zoom={AR_DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
          maxBounds={AR_MAX_BOUNDS}
          maxBoundsViscosity={0.82}
        >
          <TileLayer attribution={CARTO_ATTRIBUTION} url={CARTO_LIGHT_TILE} />
          <FitArgentinaGeoJson data={arGeo} />
          <GeoJSON
            data={arGeo as never}
            style={(feat) => styleFeature(feat as ArProvinceFeature)}
            onEachFeature={(feature, layer) => {
              const props = feature.properties as { id?: string; name?: string } | undefined;
              const id = props?.id as ArProvinceGadmId | undefined;
              const name = props?.name ?? id ?? "Provincia";
              const v = id ? provinceSums.get(id) : undefined;
              const valueStr = v != null && Number.isFinite(v) ? String(v) : "Sin dato";
              const safeName = escapeHtml(name);
              const safeKey = escapeHtml(valueKey);
              const safeVal = escapeHtml(valueStr);
              layer.bindPopup(
                `<div class="text-xs space-y-1"><strong>${safeName}</strong>${valueKey ? `<div>${safeKey}: ${safeVal}</div>` : `<div>${safeVal}</div>`}</div>`
              );
            }}
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

  const numericValues = markers.map((m) => m.value).filter((v): v is number => Number.isFinite(v));
  const minValue = numericValues.length > 0 ? Math.min(...numericValues) : null;
  const maxValue = numericValues.length > 0 ? Math.max(...numericValues) : null;

  const tileUrl =
    argentinaMode && arGeo && !arGeoError ? CARTO_LIGHT_TILE : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const attribution =
    argentinaMode && arGeo && !arGeoError
      ? CARTO_ATTRIBUTION
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  return (
    <div className="relative rounded overflow-hidden border" style={{ height: `${height}px`, borderColor: "var(--platform-border, #e2e8f0)" }}>
      <MapContainer
        center={argentinaMode ? AR_DEFAULT_CENTER : DEFAULT_CENTER}
        zoom={argentinaMode ? AR_DEFAULT_ZOOM : DEFAULT_ZOOM}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
        {...(argentinaMode && arGeo && !arGeoError
          ? { maxBounds: AR_MAX_BOUNDS, maxBoundsViscosity: 0.82 }
          : {})}
      >
        <TileLayer attribution={attribution} url={tileUrl} />
        <FitBounds points={points} />
        {markers.map((marker, i) => {
          const value = marker.value != null ? String(marker.value) : "";
          const popupLabel = marker.label || `(${marker.lat.toFixed(4)}, ${marker.lon.toFixed(4)})`;
          const popupContent = [popupLabel, value].filter(Boolean).join(" — ");
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
                <div className="space-y-1 text-xs">
                  <div>{popupContent}</div>
                  {valueKey ? <div>Valor: {value}</div> : null}
                  <div>Fuente: {marker.source || "native"}</div>
                </div>
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
  );
}
