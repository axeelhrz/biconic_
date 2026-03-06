"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type MapAggregationConfig = {
  chartXAxis?: string;
  chartYAxes?: string[];
  dimension?: string;
  dimensions?: string[];
};

type DashboardMapWidgetProps = {
  rows: Record<string, unknown>[];
  aggregationConfig?: MapAggregationConfig;
  height?: number;
};

const DEFAULT_CENTER: [number, number] = [-34.6, -58.4];
const DEFAULT_ZOOM = 3;

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

export function DashboardMapWidget({
  rows,
  aggregationConfig,
  height = 280,
}: DashboardMapWidgetProps) {
  const { points, valueKey, labelKey, latCol, lonCol } = useMemo(() => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { points: [] as [number, number][], valueKey: "", labelKey: "", latCol: "", lonCol: "" };
    }
    const first = rows[0] as Record<string, unknown>;
    const keys = Object.keys(first);

    const latKey = keys.find(
      (k) => /^lat$|^latitude$/i.test(k) || (typeof first[k] === "number" && /lat/i.test(k))
    );
    const lonKey = keys.find(
      (k) => /^lon$|^lng$|^longitude$/i.test(k) || (k !== latKey && typeof first[k] === "number" && /lon|lng|long/i.test(k))
    );

    let latColRes = latKey ?? null;
    let lonColRes = lonKey ?? null;
    if (!latColRes || !lonColRes) {
      const withLat = keys.find((k) => /lat|latitude/i.test(k));
      const withLon = keys.find((k) => /lon|lng|longitude/i.test(k));
      if (withLat && withLon) {
        latColRes = withLat;
        lonColRes = withLon;
      } else {
        const numericKeys = keys.filter((k) => typeof first[k] === "number");
        if (numericKeys.length >= 2) {
          latColRes = numericKeys[0] ?? null;
          lonColRes = numericKeys[1] ?? null;
        }
      }
    }

    const xAxis = aggregationConfig?.chartXAxis ?? aggregationConfig?.dimension ?? aggregationConfig?.dimensions?.[0];
    const yAxes = aggregationConfig?.chartYAxes;
    const labelKeyRes = (xAxis && keys.includes(xAxis)) ? xAxis : (keys.find((k) => typeof first[k] === "string") ?? "");
    const valueKeyRes = (Array.isArray(yAxes) && yAxes[0] && keys.includes(yAxes[0])) ? yAxes[0] : (keys.find((k) => typeof first[k] === "number" && k !== latColRes && k !== lonColRes) ?? "");

    if (!latColRes || !lonColRes) {
      return { points: [], valueKey: valueKeyRes ?? "", labelKey: labelKeyRes ?? "", latCol: "", lonCol: "" };
    }

    const pointsRes: [number, number][] = rows.map((row) => {
      const r = row as Record<string, unknown>;
      const lat = Number(r[latColRes!]);
      const lon = Number(r[lonColRes!]);
      return [lat, lon];
    }).filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon)) as [number, number][];

    return { points: pointsRes, valueKey: valueKeyRes ?? "", labelKey: labelKeyRes ?? "", latCol: latColRes, lonCol: lonColRes };
  }, [rows, aggregationConfig]);

  if (points.length === 0) {
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
        <p className="text-xs">Añadí columnas de latitud y longitud (ej. lat, lon) para ver marcadores.</p>
      </div>
    );
  }

  const accentColor = "var(--platform-accent, #0ea5e9)";

  return (
    <div className="rounded overflow-hidden border" style={{ height: `${height}px`, borderColor: "var(--platform-border, #e2e8f0)" }}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {rows.slice(0, 500).map((row, i) => {
          const r = row as Record<string, unknown>;
          const lat = Number(r[latCol]);
          const lon = Number(r[lonCol]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          const label = labelKey ? String(r[labelKey] ?? "") : "";
          const value = valueKey ? (r[valueKey] != null ? String(r[valueKey]) : "") : "";
          const popupContent = [label, value].filter(Boolean).join(" — ") || `(${lat.toFixed(4)}, ${lon.toFixed(4)})`;
          return (
            <CircleMarker
              key={i}
              center={[lat, lon]}
              radius={6}
              pathOptions={{
                fillColor: accentColor,
                color: accentColor,
                weight: 1.5,
                opacity: 0.9,
                fillOpacity: 0.6,
              }}
            >
              <Popup>{popupContent}</Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
