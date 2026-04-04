type CacheSelectBuilder = {
  eq: (column: string, value: string) => {
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  };
};

type CacheFromBuilder = {
  select: (columns: string) => CacheSelectBuilder;
  upsert: (payload: GeoCacheRow, options?: { onConflict?: string }) => Promise<{ error: unknown }>;
};

export type GeoCacheClient = {
  rpc: (fn: string, params?: { sql_query?: string }) => Promise<{ data: unknown; error: unknown }>;
  from: (table: string) => CacheFromBuilder;
};

const GEO_KEYWORDS = {
  country: /pais|country|nation|nacion/i,
  province: /provincia|estado|state|region|departamento/i,
  city: /ciudad|city|localidad|municipio|town/i,
  address: /direccion|domicilio|address|calle|street/i,
  lat: /^lat$|latitude|latitud/i,
  lon: /^lon$|^lng$|longitude|longitud/i,
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_TIMEOUT_MS = 7000;
const NOMINATIM_MIN_INTERVAL_MS = 1100;
const MAX_GEOCODE_ROWS = 500;

let lastNominatimCallAt = 0;
let ensureTablePromise: Promise<void> | null = null;

export type GeoHints = {
  countryField?: string;
  provinceField?: string;
  cityField?: string;
  addressField?: string;
  latField?: string;
  lonField?: string;
};

type GeoComponent = {
  country?: string;
  province?: string;
  city?: string;
  address?: string;
};

type GeoCacheRow = {
  cache_key: string;
  query_text: string;
  lat: number;
  lon: number;
  display_name: string | null;
  provider: string | null;
  updated_at?: string;
};

type GeocodeResult = {
  lat: number;
  lon: number;
  displayName?: string;
  source: "cache" | "nominatim";
};

export type EnrichRowsWithGeoOptions = {
  rows: Record<string, unknown>[];
  dimList?: string[];
  chartXAxis?: string;
  geoHints?: GeoHints;
  cacheClient?: GeoCacheClient | null;
  /** Si la fila no trae país, se añade a la consulta de geocodificación (ej. «Argentina»). */
  mapDefaultCountry?: string;
};

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const asNonEmptyText = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

const normalizeForKey = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};

const findKeyByRegex = (keys: string[], regex: RegExp): string | undefined => keys.find((k) => regex.test(k));

const getTextFromField = (row: Record<string, unknown>, key?: string): string | undefined => {
  if (!key) return undefined;
  const v = asNonEmptyText(row[key]);
  return v ?? undefined;
};

const getExistingCoordinates = (row: Record<string, unknown>, hints?: GeoHints): { lat?: number; lon?: number } => {
  const keys = Object.keys(row);
  const latKey =
    hints?.latField && keys.includes(hints.latField)
      ? hints.latField
      : findKeyByRegex(keys, GEO_KEYWORDS.lat);
  const lonKey =
    hints?.lonField && keys.includes(hints.lonField)
      ? hints.lonField
      : findKeyByRegex(keys, GEO_KEYWORDS.lon);

  const lat = latKey ? Number(row[latKey]) : NaN;
  const lon = lonKey ? Number(row[lonKey]) : NaN;
  return {
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
  };
};

const inferGeoComponents = (
  row: Record<string, unknown>,
  keys: string[],
  dimList: string[],
  geoHints?: GeoHints
): GeoComponent => {
  const candidates = Array.from(new Set([...dimList, ...keys]));
  const countryField = geoHints?.countryField ?? findKeyByRegex(candidates, GEO_KEYWORDS.country);
  const provinceField = geoHints?.provinceField ?? findKeyByRegex(candidates, GEO_KEYWORDS.province);
  const cityField = geoHints?.cityField ?? findKeyByRegex(candidates, GEO_KEYWORDS.city);
  const addressField = geoHints?.addressField ?? findKeyByRegex(candidates, GEO_KEYWORDS.address);

  return {
    country: getTextFromField(row, countryField),
    province: getTextFromField(row, provinceField),
    city: getTextFromField(row, cityField),
    address: getTextFromField(row, addressField),
  };
};

const buildGeoQueryCandidates = (parts: GeoComponent): string[] => {
  const full = [parts.address, parts.city, parts.province, parts.country].filter(Boolean).join(", ");
  const cityProvinceCountry = [parts.city, parts.province, parts.country].filter(Boolean).join(", ");
  const provinceCountry = [parts.province, parts.country].filter(Boolean).join(", ");
  const country = [parts.country].filter(Boolean).join(", ");

  return [full, cityProvinceCountry, provinceCountry, country].filter((q, i, arr) => q.length > 0 && arr.indexOf(q) === i);
};

const buildCacheKey = (parts: GeoComponent): string => {
  return ["country", "province", "city", "address"]
    .map((k) => normalizeForKey((parts as Record<string, string | undefined>)[k] ?? ""))
    .join("|");
};

const wait = async (ms: number) => {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const rateLimitNominatim = async () => {
  const now = Date.now();
  const delta = now - lastNominatimCallAt;
  if (delta < NOMINATIM_MIN_INTERVAL_MS) {
    await wait(NOMINATIM_MIN_INTERVAL_MS - delta);
  }
  lastNominatimCallAt = Date.now();
};

const ensureGeoCacheTable = async (cacheClient?: GeoCacheClient | null) => {
  if (!cacheClient) return;
  if (ensureTablePromise) return ensureTablePromise;
  ensureTablePromise = (async () => {
    try {
      await cacheClient.rpc("execute_sql", {
        sql_query: `
          CREATE TABLE IF NOT EXISTS public.geo_location_cache (
            cache_key text PRIMARY KEY,
            query_text text NOT NULL,
            lat double precision NOT NULL,
            lon double precision NOT NULL,
            display_name text NULL,
            provider text NOT NULL DEFAULT 'nominatim',
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS geo_location_cache_updated_at_idx ON public.geo_location_cache (updated_at DESC);
        `,
      });
    } catch {
      // Si no hay permisos de DDL o no existe RPC, continuar sin bloquear.
    }
  })();
  await ensureTablePromise;
};

const readCache = async (
  cacheClient: GeoCacheClient | null | undefined,
  cacheKey: string
): Promise<GeoCacheRow | null> => {
  if (!cacheClient) return null;
  await ensureGeoCacheTable(cacheClient);
  const { data, error } = await cacheClient
    .from("geo_location_cache")
    .select("cache_key,query_text,lat,lon,display_name,provider,updated_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error || !data) return null;
  return data as GeoCacheRow;
};

const writeCache = async (
  cacheClient: GeoCacheClient | null | undefined,
  payload: GeoCacheRow
) => {
  if (!cacheClient) return;
  await ensureGeoCacheTable(cacheClient);
  await cacheClient.from("geo_location_cache").upsert(payload, { onConflict: "cache_key" });
};

const geocodeWithNominatim = async (query: string): Promise<{ lat: number; lon: number; displayName?: string } | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    await rateLimitNominatim();
    const url = `${NOMINATIM_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "biconic-dashboard-map/1.0",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const first = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!first) return null;
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, displayName: first.display_name };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const resolveCoordinates = async (
  parts: GeoComponent,
  cacheClient?: GeoCacheClient | null
): Promise<GeocodeResult | null> => {
  const cacheKey = buildCacheKey(parts);
  if (!cacheKey.replace(/\|/g, "")) return null;

  const cacheHit = await readCache(cacheClient, cacheKey);
  if (cacheHit && isFiniteNumber(cacheHit.lat) && isFiniteNumber(cacheHit.lon)) {
    return {
      lat: cacheHit.lat,
      lon: cacheHit.lon,
      displayName: cacheHit.display_name ?? undefined,
      source: "cache",
    };
  }

  const candidates = buildGeoQueryCandidates(parts);
  for (const query of candidates) {
    const geocoded = await geocodeWithNominatim(query);
    if (!geocoded) continue;
    await writeCache(cacheClient, {
      cache_key: cacheKey,
      query_text: query,
      lat: geocoded.lat,
      lon: geocoded.lon,
      display_name: geocoded.displayName ?? null,
      provider: "nominatim",
    });
    return { ...geocoded, source: "nominatim" };
  }
  return null;
};

export async function enrichRowsWithGeo(options: EnrichRowsWithGeoOptions): Promise<Record<string, unknown>[]> {
  const { rows, dimList = [], chartXAxis, geoHints, cacheClient, mapDefaultCountry } = options;
  const defaultCountry = mapDefaultCountry?.trim() || undefined;
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const limitedRows = rows.slice(0, MAX_GEOCODE_ROWS);
  const restRows = rows.slice(MAX_GEOCODE_ROWS);
  const enriched: Record<string, unknown>[] = [];

  for (const row of limitedRows) {
    const r = { ...row } as Record<string, unknown>;
    const keys = Object.keys(r);
    const coords = getExistingCoordinates(r, geoHints);
    const label = chartXAxis && asNonEmptyText(r[chartXAxis]) ? String(r[chartXAxis]) : undefined;

    if (isFiniteNumber(coords.lat) && isFiniteNumber(coords.lon)) {
      r.__geo_lat = coords.lat;
      r.__geo_lon = coords.lon;
      r.__geo_label = label ?? String(coords.lat) + ", " + String(coords.lon);
      r.__geo_source = "native";
      r.__geo_resolved = true;
      enriched.push(r);
      continue;
    }

    const components = inferGeoComponents(r, keys, dimList, geoHints);
    const withCountry =
      components.country || !defaultCountry ? components : { ...components, country: defaultCountry };
    const resolved = await resolveCoordinates(withCountry, cacheClient);
    if (resolved) {
      r.__geo_lat = resolved.lat;
      r.__geo_lon = resolved.lon;
      r.__geo_label = label ?? resolved.displayName ?? buildGeoQueryCandidates(withCountry)[0] ?? "";
      r.__geo_source = resolved.source;
      r.__geo_resolved = true;
    } else {
      r.__geo_resolved = false;
      r.__geo_source = "unresolved";
      r.__geo_label = label ?? buildGeoQueryCandidates(withCountry)[0] ?? "";
    }
    enriched.push(r);
  }

  if (restRows.length > 0) {
    return [...enriched, ...restRows.map((r) => ({ ...r, __geo_resolved: false, __geo_source: "skipped_limit" }))];
  }
  return enriched;
}
