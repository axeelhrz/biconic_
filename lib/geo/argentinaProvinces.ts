/**
 * Límites provinciales: GADM 4.1 Argentina nivel 1 (uso académico / no comercial según GADM).
 * GeoJSON en /public/geo/ar-provincias.geojson con properties.id (NAME_1 GADM) y name (español).
 */

/** IDs tal como vienen en el GeoJSON (`properties.id`). */
export const AR_PROVINCE_GADM_IDS = [
  "BuenosAires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "CiudaddeBuenosAires",
  "Córdoba",
  "Corrientes",
  "EntreRíos",
  "Formosa",
  "Jujuy",
  "LaPampa",
  "LaRioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "RíoNegro",
  "Salta",
  "SanJuan",
  "SanLuis",
  "SantaCruz",
  "SantaFe",
  "SantiagodelEstero",
  "TierradelFuego",
  "Tucumán",
] as const;

export type ArProvinceGadmId = (typeof AR_PROVINCE_GADM_IDS)[number];

export const AR_GEOJSON_PATH = "/geo/ar-provincias.geojson";

export function isArgentinaDefaultCountry(mapDefaultCountry: string | undefined): boolean {
  if (!mapDefaultCountry || typeof mapDefaultCountry !== "string") return false;
  const n = mapDefaultCountry
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return n === "argentina" || n === "ar";
}

/** Colapsa a clave comparable (sin espacios ni acentos). */
export function normalizeArProvinceKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const idToNorm: Record<string, string> = Object.fromEntries(
  AR_PROVINCE_GADM_IDS.map((id) => [id, normalizeArProvinceKey(id.replace(/_/g, ""))])
);

const normToId = new Map<string, ArProvinceGadmId>();
for (const id of AR_PROVINCE_GADM_IDS) {
  normToId.set(idToNorm[id]!, id);
}

/**
 * Sinónimos (clave = normalizeArProvinceKey del texto del usuario) → clave normalizada del id GADM.
 */
const SYNONYM_TO_NORM: Record<string, string> = {
  caba: "ciudaddebuenosaires",
  capital: "ciudaddebuenosaires",
  capitalfederal: "ciudaddebuenosaires",
  ciudadautonomadebuenosaires: "ciudaddebuenosaires",
  ciudaddelabuenosaires: "ciudaddebuenosaires",
  baires: "buenosaires",
  bsas: "buenosaires",
  bsasprovincia: "buenosaires",
  pba: "buenosaires",
  provinciadebuenosaires: "buenosaires",
  tierradelfuegoantartidaeislasdelatlanticosur: "tierradelfuego",
  tierradelfuegoais: "tierradelfuego",
  santiagodelestero: "santiagodelestero",
};

/**
 * Resuelve texto de fila (provincia en datos) al `properties.id` del GeoJSON, o null.
 */
export function resolveArProvinceGadmId(raw: unknown): ArProvinceGadmId | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  let key = normalizeArProvinceKey(s);
  if (!key) return null;

  const viaSyn = SYNONYM_TO_NORM[key];
  if (viaSyn) {
    const id = normToId.get(viaSyn);
    return id ?? null;
  }

  const direct = normToId.get(key);
  if (direct) return direct;

  // "Buenos Aires, Argentina" → primera parte
  const first = s.split(",")[0]?.trim();
  if (first && first !== s) {
    return resolveArProvinceGadmId(first);
  }

  return null;
}
