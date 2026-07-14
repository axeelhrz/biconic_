export declare const AR_PROVINCE_GADM_IDS: readonly ["BuenosAires", "Catamarca", "Chaco", "Chubut", "CiudaddeBuenosAires", "Córdoba", "Corrientes", "EntreRíos", "Formosa", "Jujuy", "LaPampa", "LaRioja", "Mendoza", "Misiones", "Neuquén", "RíoNegro", "Salta", "SanJuan", "SanLuis", "SantaCruz", "SantaFe", "SantiagodelEstero", "TierradelFuego", "Tucumán"];
export type ArProvinceGadmId = (typeof AR_PROVINCE_GADM_IDS)[number];
export declare const AR_GEOJSON_PATH = "/geo/ar-provincias.geojson";
export declare const AR_GEOJSON_API_PATH = "/api/geo/ar-provincias";
export declare const AR_BOUNDING_BOX: {
    readonly minLat: -55.2;
    readonly maxLat: -20.8;
    readonly minLon: -73.8;
    readonly maxLon: -52.5;
};
export declare function isPointInArgentinaBBox(lat: number, lon: number): boolean;
export declare const AR_PROVINCE_CENTROIDS: Record<ArProvinceGadmId, {
    lat: number;
    lon: number;
}>;
export declare function getArProvinceCentroid(id: ArProvinceGadmId): {
    lat: number;
    lon: number;
} | null;
export declare function isArgentinaDefaultCountry(mapDefaultCountry: string | undefined): boolean;
export declare function normalizeArProvinceKey(raw: string): string;
export declare function resolveArProvinceGadmId(raw: unknown): ArProvinceGadmId | null;
