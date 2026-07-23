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

/** Fallback vía API cuando el middleware bloquea el asset estático. */
export const AR_GEOJSON_API_PATH = "/api/geo/ar-provincias";

/** Alineado con el encuadre del mapa en DashboardMapWidget (lat/lng). */
export const AR_BOUNDING_BOX = {
  minLat: -55.2,
  maxLat: -20.8,
  minLon: -73.8,
  maxLon: -52.5,
} as const;

export function isPointInArgentinaBBox(lat: number, lon: number): boolean {
  return (
    lat >= AR_BOUNDING_BOX.minLat &&
    lat <= AR_BOUNDING_BOX.maxLat &&
    lon >= AR_BOUNDING_BOX.minLon &&
    lon <= AR_BOUNDING_BOX.maxLon
  );
}

/**
 * Centroides del polígono principal por provincia (GADM id), derivados de ar-provincias.geojson.
 */
export const AR_PROVINCE_CENTROIDS: Record<ArProvinceGadmId, { lat: number; lon: number }> = {
  BuenosAires: { lat: -36.67549836562738, lon: -60.56205506343393 },
  Catamarca: { lat: -27.336327615082944, lon: -66.94359978806544 },
  Chaco: { lat: -26.387265822719876, lon: -60.76691518178766 },
  Chubut: { lat: -43.790210867200656, lon: -68.52586821574691 },
  CiudaddeBuenosAires: { lat: -34.61761355326359, lon: -58.444370995315985 },
  Córdoba: { lat: -32.141135608503596, lon: -63.799556068847835 },
  Corrientes: { lat: -28.776272193840487, lon: -57.805869320052636 },
  EntreRíos: { lat: -32.047270049096326, lon: -59.20572662030234 },
  Formosa: { lat: -24.894485812397754, lon: -59.934195877966694 },
  Jujuy: { lat: -23.31941922170246, lon: -65.76174431204471 },
  LaPampa: { lat: -37.13021957982957, lon: -65.4483530388636 },
  LaRioja: { lat: -29.678131775099537, lon: -67.18066223306123 },
  Mendoza: { lat: -34.628603273282835, lon: -68.5870302750928 },
  Misiones: { lat: -26.874892952023437, lon: -54.64725170428022 },
  Neuquén: { lat: -38.63921765945261, lon: -70.11760381805207 },
  RíoNegro: { lat: -40.40647047127993, lon: -67.22842968149803 },
  Salta: { lat: -24.296134316579266, lon: -64.81725572662444 },
  SanJuan: { lat: -30.85940149566004, lon: -68.88175243056162 },
  SanLuis: { lat: -33.767456774650086, lon: -66.02993211997952 },
  SantaCruz: { lat: -48.810802353534214, lon: -69.92690912316122 },
  SantaFe: { lat: -30.70342928985597, lon: -60.95066971236405 },
  SantiagodelEstero: { lat: -27.782223839051234, lon: -63.258486975120476 },
  TierradelFuego: { lat: -54.321013513820255, lon: -67.47733648478123 },
  Tucumán: { lat: -26.943782273149736, lon: -65.36568838799188 },
};

export function getArProvinceCentroid(id: ArProvinceGadmId): { lat: number; lon: number } | null {
  return AR_PROVINCE_CENTROIDS[id] ?? null;
}

export function isArgentinaDefaultCountry(mapDefaultCountry: string | undefined): boolean {
  if (!mapDefaultCountry || typeof mapDefaultCountry !== "string") return false;
  const n = mapDefaultCountry
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return (
    n === "argentina" ||
    n === "ar" ||
    n === "arg" ||
    n === "republicaargentina" ||
    n === "republicargentina"
  );
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
  granbuenosaires: "buenosaires",
  gba: "buenosaires",
  cba: "cordoba",
  cordobacapital: "cordoba",
  mdz: "mendoza",
  mendozacapital: "mendoza",
  sf: "santafe",
  stafe: "santafe",
  santafeprovincia: "santafe",
  provinciadesantafe: "santafe",
  rosario: "santafe",
  laplata: "buenosaires",
  mardelplata: "buenosaires",
  neuquencapital: "neuquen",
  jujuyprovincia: "jujuy",
  chubutprovincia: "chubut",
  santacruzprovincia: "santacruz",
  lapampa: "lapampa",
  lapampaprovincia: "lapampa",
  entrerios: "entrerios",
  entre: "entrerios",
  corrientesprovincia: "corrientes",
  misionesprovincia: "misiones",
  formosaprovincia: "formosa",
  catamarcaprovincia: "catamarca",
  sanjuanprovincia: "sanjuan",
  sanluisprovincia: "sanluis",
  rionegro: "rionegro",
  rionegroprovincia: "rionegro",
  chacoprovincia: "chaco",
  tf: "tierradelfuego",
  tdf: "tierradelfuego",
  tierradelfuegoantartidaeislasdelatlanticosur: "tierradelfuego",
  tierradelfuegoais: "tierradelfuego",
  santiagodelestero: "santiagodelestero",
  santiagodel: "santiagodelestero",
  /** ISO 3166-2:AR (sin guión) + códigos INDEC habituales. */
  arb: "buenosaires",
  arc: "ciudaddebuenosaires",
  ark: "catamarca",
  arh: "chaco",
  aru: "chubut",
  arx: "cordoba",
  arw: "corrientes",
  are: "entrerios",
  arp: "formosa",
  ary: "jujuy",
  arl: "lapampa",
  arf: "larioja",
  arm: "mendoza",
  arn: "misiones",
  arq: "neuquen",
  arr: "rionegro",
  ara: "salta",
  arj: "sanjuan",
  ard: "sanluis",
  arz: "santacruz",
  ars: "santafe",
  arg: "santiagodelestero",
  arv: "tierradelfuego",
  art: "tucuman",
  "02": "ciudaddebuenosaires",
  "06": "buenosaires",
  "10": "catamarca",
  "14": "cordoba",
  "18": "corrientes",
  "22": "chaco",
  "26": "chubut",
  "30": "entrerios",
  "34": "formosa",
  "38": "jujuy",
  "42": "lapampa",
  "46": "larioja",
  "50": "mendoza",
  "54": "misiones",
  "58": "neuquen",
  "62": "rionegro",
  "66": "salta",
  "70": "sanjuan",
  "74": "sanluis",
  "78": "santacruz",
  "82": "santafe",
  "86": "santiagodelestero",
  "90": "tucuman",
  "94": "tierradelfuego",
};

/** Prefijos habituales en datasets: "Provincia de Córdoba", "Pcia. Mendoza", etc. */
const PROVINCE_PREFIX_RE =
  /^(?:provincia|pcia|prov|departamento|dpto|dto)(?:\s*(?:de|del|de\s+la|de\s+los))?\s+/i;

for (const id of AR_PROVINCE_GADM_IDS) {
  const n = idToNorm[id]!;
  const autoPrefixes = [
    `provincia${n}`,
    `provinciade${n}`,
    `provinciadel${n}`,
    `pcia${n}`,
    `pciade${n}`,
    `prov${n}`,
    `provde${n}`,
  ];
  for (const p of autoPrefixes) {
    if (!SYNONYM_TO_NORM[p]) SYNONYM_TO_NORM[p] = n;
  }
}

function lookupNormKey(key: string): ArProvinceGadmId | null {
  if (!key) return null;
  const viaSyn = SYNONYM_TO_NORM[key];
  if (viaSyn) return normToId.get(viaSyn) ?? null;
  return normToId.get(key) ?? null;
}

/**
 * Match por contención cuando el texto incluye el nombre de provincia (o al revés),
 * eligiendo la coincidencia más larga y única para evitar "San" → San Juan/San Luis.
 */
function resolveByContainment(key: string): ArProvinceGadmId | null {
  if (key.length < 4) return null;
  let best: { id: ArProvinceGadmId; score: number } | null = null;
  let ties = 0;
  for (const id of AR_PROVINCE_GADM_IDS) {
    const n = idToNorm[id]!;
    if (n.length < 4) continue;
    let score = 0;
    if (key === n) score = n.length + 100;
    else if (key.includes(n)) score = n.length;
    else if (n.includes(key) && key.length >= 5) score = key.length;
    else continue;
    if (!best || score > best.score) {
      best = { id, score };
      ties = 1;
    } else if (score === best.score && id !== best.id) {
      ties += 1;
    }
  }
  return ties === 1 && best ? best.id : null;
}

/**
 * Resuelve texto de fila (provincia en datos) al `properties.id` del GeoJSON, o null.
 */
export function resolveArProvinceGadmId(raw: unknown): ArProvinceGadmId | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const key = normalizeArProvinceKey(s);
  if (!key) return null;

  const direct = lookupNormKey(key);
  if (direct) return direct;

  // "Buenos Aires, Argentina" / "Tierra del Fuego, Antártida…" → primera parte
  const first = s.split(",")[0]?.trim();
  if (first && first !== s) {
    const viaFirst = resolveArProvinceGadmId(first);
    if (viaFirst) return viaFirst;
  }

  // Quitar "Provincia de …" / "Pcia. …" y reintentar
  const strippedLabel = s.replace(PROVINCE_PREFIX_RE, "").trim();
  if (strippedLabel && strippedLabel !== s) {
    const viaStrip = resolveArProvinceGadmId(strippedLabel);
    if (viaStrip) return viaStrip;
  }

  const contained = resolveByContainment(key);
  if (contained) return contained;

  return null;
}

/**
 * Heurística: ¿las etiquetas de dimensión parecen provincias argentinas?
 * Sirve para activar coropleta aunque `mapDefaultCountry` no esté seteado (dashboards migrados).
 */
export function rowsSuggestArgentinaProvinces(
  labels: Iterable<unknown>,
  options?: { minHits?: number; minRatio?: number; sampleLimit?: number }
): boolean {
  const minHits = options?.minHits ?? 3;
  const minRatio = options?.minRatio ?? 0.35;
  const sampleLimit = options?.sampleLimit ?? 48;
  let checked = 0;
  let hits = 0;
  for (const raw of labels) {
    if (checked >= sampleLimit) break;
    if (raw == null) continue;
    const s = String(raw).trim();
    if (!s) continue;
    checked += 1;
    if (resolveArProvinceGadmId(s)) hits += 1;
  }
  if (checked === 0) return false;
  return hits >= minHits || hits / checked >= minRatio;
}
