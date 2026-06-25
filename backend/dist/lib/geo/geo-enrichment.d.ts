type CacheSelectBuilder = {
    eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
            data: unknown;
            error: unknown;
        }>;
    };
};
type CacheFromBuilder = {
    select: (columns: string) => CacheSelectBuilder;
    upsert: (payload: GeoCacheRow, options?: {
        onConflict?: string;
    }) => Promise<{
        error: unknown;
    }>;
};
export type GeoCacheClient = {
    rpc: (fn: string, params?: {
        sql_query?: string;
    }) => Promise<{
        data: unknown;
        error: unknown;
    }>;
    from: (table: string) => CacheFromBuilder;
};
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
export type GeoComponentOverrides = Partial<Pick<GeoComponent, "country" | "province" | "city">>;
export type GeoInferencePreview = {
    components: GeoComponent;
    countryField?: string;
    provinceField?: string;
    cityField?: string;
    addressField?: string;
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
export type EnrichRowsWithGeoOptions = {
    rows: Record<string, unknown>[];
    dimList?: string[];
    chartXAxis?: string;
    geoHints?: GeoHints;
    cacheClient?: GeoCacheClient | null;
    mapDefaultCountry?: string;
    geoComponentOverrides?: GeoComponentOverrides;
    geoOverridesByXLabel?: Record<string, GeoComponentOverrides>;
};
export declare function getGeoInferencePreview(row: Record<string, unknown>, keys: string[], dimList: string[], geoHints?: GeoHints): GeoInferencePreview;
export declare function coerceGeoComponentOverrides(input: unknown): GeoComponentOverrides | undefined;
export declare function coerceGeoOverridesByXLabel(input: unknown): Record<string, GeoComponentOverrides> | undefined;
export declare function compactGeoComponentOverridesForRequest(o: GeoComponentOverrides | undefined): GeoComponentOverrides | undefined;
export declare function compactGeoOverridesByXLabelForRequest(m: Record<string, GeoComponentOverrides> | undefined): Record<string, GeoComponentOverrides> | undefined;
export declare function enrichRowsWithGeo(options: EnrichRowsWithGeoOptions): Promise<Record<string, unknown>[]>;
export {};
