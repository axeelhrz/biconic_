"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGeoInferencePreview = getGeoInferencePreview;
exports.coerceGeoComponentOverrides = coerceGeoComponentOverrides;
exports.coerceGeoOverridesByXLabel = coerceGeoOverridesByXLabel;
exports.compactGeoComponentOverridesForRequest = compactGeoComponentOverridesForRequest;
exports.compactGeoOverridesByXLabelForRequest = compactGeoOverridesByXLabelForRequest;
exports.enrichRowsWithGeo = enrichRowsWithGeo;
const argentinaProvinces_1 = require("./argentinaProvinces");
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
const GEOCODE_TIME_BUDGET_MS = 25000;
let lastNominatimCallAt = 0;
function mapDefaultCountryToNominatimCountryCodes(mapDefaultCountry) {
    if (!mapDefaultCountry?.trim())
        return undefined;
    const n = mapDefaultCountry
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
    if (n === "argentina" || n === "ar")
        return "ar";
    if (n === "espana" || n === "españa" || n === "spain" || n === "es")
        return "es";
    if (n === "chile" || n === "cl")
        return "cl";
    if (n === "brasil" || n === "brazil" || n === "br")
        return "br";
    if (n === "uruguay" || n === "uy")
        return "uy";
    if (n === "paraguay" || n === "py")
        return "py";
    if (n === "bolivia" || n === "bo")
        return "bo";
    return undefined;
}
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
const asNonEmptyText = (v) => {
    if (v == null)
        return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
};
const normalizeForKey = (value) => {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
};
const findKeyByRegex = (keys, regex) => keys.find((k) => regex.test(k));
const getTextFromField = (row, key) => {
    if (!key)
        return undefined;
    const v = asNonEmptyText(row[key]);
    return v ?? undefined;
};
const getExistingCoordinates = (row, hints) => {
    const keys = Object.keys(row);
    const latKey = hints?.latField && keys.includes(hints.latField)
        ? hints.latField
        : findKeyByRegex(keys, GEO_KEYWORDS.lat);
    const lonKey = hints?.lonField && keys.includes(hints.lonField)
        ? hints.lonField
        : findKeyByRegex(keys, GEO_KEYWORDS.lon);
    const lat = latKey ? Number(row[latKey]) : NaN;
    const lon = lonKey ? Number(row[lonKey]) : NaN;
    return {
        lat: Number.isFinite(lat) ? lat : undefined,
        lon: Number.isFinite(lon) ? lon : undefined,
    };
};
function resolveGeoFieldKeys(candidates, geoHints) {
    return {
        countryField: geoHints?.countryField ?? findKeyByRegex(candidates, GEO_KEYWORDS.country),
        provinceField: geoHints?.provinceField ?? findKeyByRegex(candidates, GEO_KEYWORDS.province),
        cityField: geoHints?.cityField ?? findKeyByRegex(candidates, GEO_KEYWORDS.city),
        addressField: geoHints?.addressField ?? findKeyByRegex(candidates, GEO_KEYWORDS.address),
    };
}
const inferGeoComponents = (row, keys, dimList, geoHints) => {
    const candidates = Array.from(new Set([...dimList, ...keys]));
    const f = resolveGeoFieldKeys(candidates, geoHints);
    return {
        country: getTextFromField(row, f.countryField),
        province: getTextFromField(row, f.provinceField),
        city: getTextFromField(row, f.cityField),
        address: getTextFromField(row, f.addressField),
    };
};
function getGeoInferencePreview(row, keys, dimList, geoHints) {
    const candidates = Array.from(new Set([...dimList, ...keys]));
    const f = resolveGeoFieldKeys(candidates, geoHints);
    return {
        components: {
            country: getTextFromField(row, f.countryField),
            province: getTextFromField(row, f.provinceField),
            city: getTextFromField(row, f.cityField),
            address: getTextFromField(row, f.addressField),
        },
        countryField: f.countryField,
        provinceField: f.provinceField,
        cityField: f.cityField,
        addressField: f.addressField,
    };
}
function mergeGeoComponentPatches(base, patch) {
    if (!patch)
        return base;
    const out = { ...base };
    if (asNonEmptyText(patch.country))
        out.country = String(patch.country).trim();
    if (asNonEmptyText(patch.province))
        out.province = String(patch.province).trim();
    if (asNonEmptyText(patch.city))
        out.city = String(patch.city).trim();
    return out;
}
function lookupGeoOverrideByXLabel(xLabel, map) {
    if (!map || xLabel == null)
        return undefined;
    const t = String(xLabel).trim();
    if (!t)
        return undefined;
    const low = t.toLowerCase();
    for (const [k, v] of Object.entries(map)) {
        if (k.trim().toLowerCase() === low)
            return v;
    }
    return undefined;
}
function coerceGeoComponentOverrides(input) {
    if (!input || typeof input !== "object" || Array.isArray(input))
        return undefined;
    const o = input;
    const out = {};
    if (typeof o.country === "string")
        out.country = o.country;
    if (typeof o.province === "string")
        out.province = o.province;
    if (typeof o.city === "string")
        out.city = o.city;
    return Object.keys(out).length > 0 ? out : undefined;
}
function coerceGeoOverridesByXLabel(input) {
    if (!input || typeof input !== "object" || Array.isArray(input))
        return undefined;
    const src = input;
    const out = {};
    for (const [k, v] of Object.entries(src)) {
        const patch = coerceGeoComponentOverrides(v);
        if (patch)
            out[k] = patch;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
function compactGeoComponentOverridesForRequest(o) {
    if (!o)
        return undefined;
    const out = {};
    if (typeof o.country === "string" && o.country.trim())
        out.country = o.country.trim();
    if (typeof o.province === "string" && o.province.trim())
        out.province = o.province.trim();
    if (typeof o.city === "string" && o.city.trim())
        out.city = o.city.trim();
    return Object.keys(out).length > 0 ? out : undefined;
}
function compactGeoOverridesByXLabelForRequest(m) {
    if (!m)
        return undefined;
    const out = {};
    for (const [k, v] of Object.entries(m)) {
        const ck = k.trim();
        const patch = compactGeoComponentOverridesForRequest(v);
        if (ck && patch)
            out[ck] = patch;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
const buildGeoQueryCandidates = (parts) => {
    const full = [parts.address, parts.city, parts.province, parts.country].filter(Boolean).join(", ");
    const cityProvinceCountry = [parts.city, parts.province, parts.country].filter(Boolean).join(", ");
    const provinceCountry = [parts.province, parts.country].filter(Boolean).join(", ");
    const country = [parts.country].filter(Boolean).join(", ");
    return [full, cityProvinceCountry, provinceCountry, country].filter((q, i, arr) => q.length > 0 && arr.indexOf(q) === i);
};
const buildCacheKey = (parts) => {
    return ["country", "province", "city", "address"]
        .map((k) => normalizeForKey(parts[k] ?? ""))
        .join("|");
};
const wait = async (ms) => {
    if (ms <= 0)
        return;
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
const readCache = async (cacheClient, cacheKey) => {
    if (!cacheClient)
        return null;
    try {
        const { data, error } = await cacheClient
            .from("geo_location_cache")
            .select("cache_key,lat,lng")
            .eq("cache_key", cacheKey)
            .maybeSingle();
        if (error || !data)
            return null;
        return data;
    }
    catch {
        return null;
    }
};
const writeCache = async (cacheClient, payload) => {
    if (!cacheClient)
        return;
    try {
        await cacheClient.from("geo_location_cache").upsert(payload, { onConflict: "cache_key" });
    }
    catch {
    }
};
const geocodeWithNominatim = async (query, opts) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
    try {
        await rateLimitNominatim();
        const params = new URLSearchParams({
            format: "jsonv2",
            limit: "1",
            q: query,
        });
        if (opts?.countryCodes?.trim()) {
            params.set("countrycodes", opts.countryCodes.trim().toLowerCase());
        }
        const url = `${NOMINATIM_URL}?${params.toString()}`;
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "User-Agent": "biconic-dashboard-map/1.0",
            },
            signal: controller.signal,
            cache: "no-store",
        });
        if (!res.ok)
            return null;
        const data = (await res.json());
        const first = Array.isArray(data) && data.length > 0 ? data[0] : null;
        if (!first)
            return null;
        const lat = Number(first.lat);
        const lon = Number(first.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon))
            return null;
        return { lat, lon, displayName: first.display_name };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
};
const resolveCoordinates = async (parts, cacheClient, ctx) => {
    const cc = ctx?.nominatimCountryCodes?.trim().toLowerCase();
    const baseKey = buildCacheKey(parts);
    if (!baseKey.replace(/\|/g, ""))
        return null;
    const cacheKey = cc ? `${baseKey}|cc:${cc}` : baseKey;
    const cacheHit = await readCache(cacheClient, cacheKey);
    if (cacheHit && isFiniteNumber(cacheHit.lat) && isFiniteNumber(cacheHit.lng)) {
        if (ctx?.restrictResultsToArgentinaBBox && !(0, argentinaProvinces_1.isPointInArgentinaBBox)(cacheHit.lat, cacheHit.lng)) {
        }
        else {
            return { lat: cacheHit.lat, lon: cacheHit.lng, source: "cache" };
        }
    }
    const candidates = buildGeoQueryCandidates(parts);
    for (const query of candidates) {
        const geocoded = await geocodeWithNominatim(query, cc ? { countryCodes: cc } : undefined);
        if (!geocoded)
            continue;
        if (ctx?.restrictResultsToArgentinaBBox && !(0, argentinaProvinces_1.isPointInArgentinaBBox)(geocoded.lat, geocoded.lon)) {
            continue;
        }
        await writeCache(cacheClient, { cache_key: cacheKey, lat: geocoded.lat, lng: geocoded.lon });
        return { ...geocoded, source: "nominatim" };
    }
    return null;
};
async function enrichRowsWithGeo(options) {
    const { rows, dimList = [], chartXAxis, geoHints, cacheClient, mapDefaultCountry, geoComponentOverrides, geoOverridesByXLabel, } = options;
    const defaultCountry = mapDefaultCountry?.trim() || undefined;
    const argentinaMode = (0, argentinaProvinces_1.isArgentinaDefaultCountry)(defaultCountry);
    const nominatimCc = mapDefaultCountryToNominatimCountryCodes(defaultCountry);
    if (!Array.isArray(rows) || rows.length === 0)
        return rows;
    const limitedRows = rows.slice(0, MAX_GEOCODE_ROWS);
    const restRows = rows.slice(MAX_GEOCODE_ROWS);
    const enriched = [];
    const geocodeInFlight = new Map();
    const geoStartedAt = Date.now();
    const resolveCoordinatesDeduped = (parts, resolveCtx) => {
        const cc = resolveCtx?.nominatimCountryCodes?.trim().toLowerCase();
        const baseKey = buildCacheKey(parts);
        if (!baseKey.replace(/\|/g, ""))
            return Promise.resolve(null);
        const cacheKey = cc ? `${baseKey}|cc:${cc}` : baseKey;
        const existing = geocodeInFlight.get(cacheKey);
        if (existing)
            return existing;
        const pending = resolveCoordinates(parts, cacheClient, resolveCtx);
        geocodeInFlight.set(cacheKey, pending);
        return pending;
    };
    for (const row of limitedRows) {
        const r = { ...row };
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
        let components = inferGeoComponents(r, keys, dimList, geoHints);
        components = mergeGeoComponentPatches(components, geoComponentOverrides);
        const xLabForOverride = label?.trim();
        const xOv = lookupGeoOverrideByXLabel(xLabForOverride, geoOverridesByXLabel);
        if (xOv)
            components = mergeGeoComponentPatches(components, xOv);
        const withCountry = components.country || !defaultCountry ? components : { ...components, country: defaultCountry };
        if (argentinaMode) {
            const tryTexts = [label, withCountry.province].filter((x) => typeof x === "string" && x.trim().length > 0);
            const seen = new Set();
            let usedProvinceCentroid = false;
            for (const t of tryTexts) {
                if (seen.has(t))
                    continue;
                seen.add(t);
                const pid = (0, argentinaProvinces_1.resolveArProvinceGadmId)(t);
                if (!pid)
                    continue;
                const cent = (0, argentinaProvinces_1.getArProvinceCentroid)(pid);
                if (!cent)
                    continue;
                r.__geo_lat = cent.lat;
                r.__geo_lon = cent.lon;
                r.__geo_label = label ?? t;
                r.__geo_source = "ar_province_centroid";
                r.__geo_resolved = true;
                enriched.push(r);
                usedProvinceCentroid = true;
                break;
            }
            if (usedProvinceCentroid)
                continue;
        }
        const resolveCtx = nominatimCc || argentinaMode
            ? {
                nominatimCountryCodes: nominatimCc,
                restrictResultsToArgentinaBBox: argentinaMode && nominatimCc === "ar",
            }
            : undefined;
        const budgetCc = resolveCtx?.nominatimCountryCodes?.trim().toLowerCase();
        const budgetBaseKey = buildCacheKey(withCountry);
        const budgetCacheKey = budgetCc ? `${budgetBaseKey}|cc:${budgetCc}` : budgetBaseKey;
        const isNewLookup = !geocodeInFlight.has(budgetCacheKey);
        if (isNewLookup && Date.now() - geoStartedAt > GEOCODE_TIME_BUDGET_MS) {
            r.__geo_resolved = false;
            r.__geo_source = "skipped_time_budget";
            r.__geo_label = label ?? buildGeoQueryCandidates(withCountry)[0] ?? "";
            enriched.push(r);
            continue;
        }
        const resolved = await resolveCoordinatesDeduped(withCountry, resolveCtx);
        if (resolved) {
            r.__geo_lat = resolved.lat;
            r.__geo_lon = resolved.lon;
            r.__geo_label = label ?? resolved.displayName ?? buildGeoQueryCandidates(withCountry)[0] ?? "";
            r.__geo_source = resolved.source;
            r.__geo_resolved = true;
        }
        else {
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
//# sourceMappingURL=geo-enrichment.js.map