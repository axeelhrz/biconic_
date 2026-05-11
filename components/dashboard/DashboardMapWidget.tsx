"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  AR_BOUNDING_BOX,
  AR_GEOJSON_PATH,
  isArgentinaDefaultCountry,
  isPointInArgentinaBBox,
  resolveArProvinceGadmId,
  type ArProvinceGadmId,
} from "@/lib/geo/argentinaProvinces";
import { findArProvinceGadmIdForLatLon } from "@/lib/geo/pointInProvinceGeoJson";
import type { MapVisualConfigInput } from "@/lib/dashboard/mapVisualScale";
import { resolveChoroplethVisual, resolveMapVisualStyle, resolveMarkerVisual } from "@/lib/dashboard/mapVisualScale";
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

    /** En Argentina con GeoJSON cargado, no se usan puntos: el valor va al polígono de la provincia. */
    const markersRes: Array<{
      lat: number;
      lon: number;
      value: number | null;
      label: string;
      source: string;
      detailRow: Record<string, unknown>;
    }> = [];
    if (!useProvincePolygons) {
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

  const useArChoropleth =
    argentinaMode && arGeo && !arGeoError && provinceSums.size > 0;

  const choroplethNumeric = useMemo(() => [...provinceSums.values()].filter((v) => Number.isFinite(v)), [provinceSums]);
  const chMin = choroplethNumeric.length > 0 ? Math.min(...choroplethNumeric) : null;
  const chMax = choroplethNumeric.length > 0 ? Math.max(...choroplethNumeric) : null;

  const points = markers.map((m) => [m.lat, m.lon] as [number, number]);

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
                return;
              }
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
  );
}
