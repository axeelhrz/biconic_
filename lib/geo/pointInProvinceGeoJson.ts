/**
 * Punto (lat/lon WGS84) dentro de polígonos del GeoJSON de provincias AR.
 * Coordenadas GeoJSON: [lon, lat].
 */

import type { ArProvinceGadmId } from "@/lib/geo/argentinaProvinces";

type GeoRing = ReadonlyArray<ReadonlyArray<number>>;

function pointInRing(lon: number, lat: number, ring: GeoRing): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    const denom = yj - yi;
    if (denom === 0) continue;
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Un polígono GeoJSON: anillos [exterior, agujeros…]. */
function pointInPolygonRings(lon: number, lat: number, rings: ReadonlyArray<GeoRing>): boolean {
  if (rings.length === 0) return false;
  if (!pointInRing(lon, lat, rings[0]!)) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lon, lat, rings[i]!)) return false;
  }
  return true;
}

function pointInPolygonGeometry(lon: number, lat: number, geometry: { type?: string; coordinates?: unknown }): boolean {
  const t = geometry.type;
  const c = geometry.coordinates;
  if (t === "Polygon" && Array.isArray(c)) {
    return pointInPolygonRings(lon, lat, c as GeoRing[]);
  }
  if (t === "MultiPolygon" && Array.isArray(c)) {
    for (const polygon of c as GeoRing[][]) {
      if (pointInPolygonRings(lon, lat, polygon)) return true;
    }
  }
  return false;
}

type ProvinceFeature = {
  type?: string;
  properties?: { id?: string } | null;
  geometry?: unknown;
};

type ProvinceFeatureCollection = {
  type?: string;
  features?: ProvinceFeature[];
};

/**
 * Devuelve el `properties.id` GADM de la provincia que contiene el punto, o null.
 */
export function findArProvinceGadmIdForLatLon(
  fc: ProvinceFeatureCollection | null | undefined,
  lat: number,
  lon: number
): ArProvinceGadmId | null {
  if (!fc?.features?.length || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const feature of fc.features) {
    const geom = feature.geometry as { type?: string; coordinates?: unknown } | null | undefined;
    if (!geom) continue;
    if (pointInPolygonGeometry(lon, lat, geom)) {
      const id = feature.properties?.id;
      if (typeof id === "string" && id) return id as ArProvinceGadmId;
    }
  }
  return null;
}
